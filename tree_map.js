
var dataset = "small_dataset";

var prefix = '$userRuleDocument$';
var documentID;
var decisionTreeLocal;

var currentNode = { id: undefined, depth: undefined };

var treeHeight = 0;
var treeWidth = 0;
var isMapFullyDrawn = false;

var contextMenuShowing = false;

var tree;
var root;
var nodes;
var questionSvg;
var mapviewSvg;
var separateSections;
var containerWidth;
var containerHeight;
var translateToRoot = [0, 0];

// transitions and listeners
var duration = 750;
var zoomListener;
var formerZoomTransform;

// fixed variables
var fixedWidth = 200;
var questionSvgHeight = 50;
var svgScaleExtent = [0.15, 4];
var svgMargin = { top: 20, right: 120, bottom: 20, left: 35 };
/*
 * toogle this one based on your preference:
 *  - includeCollapsedNodesForTreeHeight - is a boolean to whether include or
 *  not the collapsed nodes to calculate the tree height.
 *  - if true, 100 is fine; if false, fixedHeight should be a bit higher
 */
var includeCollapsedNodesForTreeHeight = false;
/* good values - [100, 150] */
var fixedHeight = 140;

// var Variables important for mapview
var getIcon = function(iconName) {
  const icons_pwd = 'assets/';
  return icons_pwd + iconName + '.svg';
};

function TreeMap(datasetName) {
  dataset = datasetName;
  initDrawMapView();
}

/*
 * if map was fully drawn and there is a change on the rule document
 * remove all elements inside the mapView svgs
 */
var resetMapView = function() {
  if (isMapFullyDrawn) {
    d3.select('g.questionZoom').remove();
    d3.select('g.mapviewZoom').remove();
    d3.select('g.zoomBtnGroup').remove();
    isMapFullyDrawn = false;
  }
}

/*
 * draws map view
 */
var drawMapView = function() {

  const jsonTreeData = decisionTreeLocal;

  // currentStorage represents throughout the document the collapsed nodes
  // for this chart
  const collapseNodesStorage = loadStorage('collapsedNodes');
  // const parentBranchActionsStorage = loadStorage('parentBranchActions');
  // const parentBranchRationalesStorage = loadStorage('parentBranchRationales');


  // MISSING selected node storage, nodes with actions, attachments
  // setting the d3.hierarchy
  root = d3.hierarchy(jsonTreeData.root, (d) => {
    return (!d.connections ? [] : d.connections.map((c, i) => {
      // transfering data from the connections Node to a newNode for d3
      // handling, plus adding branch name and options from the connection

      var isNodeIdInStorage = false,
          __hasParentBranchRationales = false,
          __hasParentBranchActions = false;

      // check if node is collapsed on localStorage
      if (collapseNodesStorage) {
        isNodeIdInStorage = (collapseNodesStorage.indexOf(c.node.id) !== -1);
      }

      // check if its parent branch has actions or rationales attached
      const options = d.connections[i].options;
      if (options) {

        // MISSING: storage actions - attachments
        options.forEach ((option) => {
          if (!__hasParentBranchActions) {
            __hasParentBranchActions = (option['actions'] &&
              option['actions'].length > 0); 
              // || parentBranchActionsStorage.indexOf(c.node.id) !== -1
          }
          if (!__hasParentBranchRationales) {
            __hasParentBranchRationales = (option['rationales'] &&
              option['rationales'].length > 0); 
              // || parentBranchRationalesStorage.indexOf(c.node.id) !== -1
          }
        })
      }

      return Object.assign({}, c.node, {
        parentBranchName: d.connections[i].name,
        parentBranchOptions: options,
        hasParentBranchRationales: __hasParentBranchRationales,
        hasParentBranchActions: __hasParentBranchActions,
        state: (isNodeIdInStorage ? 'closed' : 'open')
      });
    }));
  });

  // setting the state on the root node
  root.data.state = (collapseNodesStorage &&
    collapseNodesStorage.indexOf(root.data.id) !== -1 ? 'closed' : 'open');

  console.log(root);
  // zoomListener function
  zoomListener = d3.zoom().scaleExtent(svgScaleExtent)
    .on('end', () => {
      formerZoomTransform = d3.event.transform;
    })
    .on('zoom', () => { triggerZoom(false, questionSvgHeight) });

  /*
   * set svgs and tree Height and width
   * compute the new height, based on amount of nodes on a level
   */
  const maxTreeHeight = d3.max(getDepthWidth()) * fixedHeight,
        svgWidth = '100%',
        svgHeight = '100%';

  treeHeight = maxTreeHeight;
  treeWidth = fixedWidth * (root.height + 2);
  containerWidth = (containerWidth || window.screen.width);
  containerHeight = (containerHeight ||
          0.5 * window.screen.height - 120);
  translateToRoot[0] = svgMargin.left - 1 + d3.max([
    (containerWidth - treeWidth + fixedWidth) / 2, 0
  ]);

  // center questions and mapview on the viewport
  // questionSvg setup
  questionSvg = d3.select('div#mapView svg.questionMapSvg')
    .attr('width', svgWidth)
    .attr('height', questionSvgHeight)
      .append('g')
      .attr('class', 'questionZoom')
        .append('g')
        .attr('class', 'questionGlobalG')
        .attr('transform', 'translate(' +
          (translateToRoot[0] - svgMargin.left) + ', ' + 0 + ')'
        );

  // mapView setup
  mapviewSvg = d3.select('svg.ruleMapSvg')
    .style('width', svgWidth)
    .style('height', svgHeight)
    .style('min-height', '50px')
    .call(zoomListener)
      .append('g')
      .attr('class', 'mapviewZoom')
        .append('g')
        .attr('class', 'mapviewGlobalG');

  // zoom Buttons Svg
  const zoomBtnWidth = 30;
  const zoomSvg = d3.select('div#mapView svg.ruleMapZoomBtnSvg')
    .style('position', 'absolute')
    .style('right', '16px')
    .style('top', '64px')
    .attr('width', (zoomBtnWidth * 3) + 'px')
    .attr('height', zoomBtnWidth + 'px')
    .append('g')
    .attr('class', 'zoomBtnGroup');

  // setUp of the svg Buttons for zoom and reset
  const svgToBeZoomed  = d3.select('svg.ruleMapSvg');
  const zoomBtnGroups = zoomSvg.selectAll('g.zoomButtons')
    .data(['zoomIn', 'zoomReset', 'zoomOut'])
    .enter()
    .append('g')
    .attr('class', (d) => { return 'clickable zoomRectBtn ' + d; })
    .attr('transform', (d, i) => {
      return 'translate(' + (i * zoomBtnWidth) + ', 0)'
    })
    .on('click', (d, i) => {
      if (d === 'zoomIn') {
        svgToBeZoomed.transition().duration(500)
          .call(zoomListener.scaleBy, 1.5);
      }
      if (d === 'zoomOut') {
        svgToBeZoomed.transition().duration(500)
          .call(zoomListener.scaleBy, 0.7);
      }
      if (d === 'zoomReset') {
        svgToBeZoomed.transition().duration(500)
          .call(zoomListener.transform,
            d3.zoomIdentity.scale(1).translate(0, 0));

        placeTreeInViewportCenter();
      }
    });

  zoomBtnGroups.append('rect')
    .attr('height', zoomBtnWidth)
    .attr('width', zoomBtnWidth);

  zoomBtnGroups.append('svg:image')
    .attr('xlink:href', (d) => {
     if (d === 'zoomIn') { return getIcon('plus'); }
     if (d === 'zoomReset') { return getIcon('center'); }
     return getIcon('less');
    })
    .attr('height', '10px')
    .attr('width', '10px')
    .attr('x', 10)
    .attr('y', 10);


  // add separating lines between questions in the mapview
  const separateSectionsArray = [
    0,
    ...jsonTreeData.definition.questions.map( (d, i) => {
      return i + 1;
    })
  ];

  separateSections = mapviewSvg.selectAll('g.mapSection')
    .data(separateSectionsArray)
    .enter()
    .append('g')
    .attr('class', 'mapSection')
    .attr('transform', (d, i) => {
      return 'translate(' + (i * fixedWidth - svgMargin.left) + ', ' + 0 + ')';
    });

  separateSections.append('line')
    .attr('class', 'mapSeparator')
    .attr('stroke-opacity', 0.5)
    .attr('x1', 0)
    .attr('y1', -10 * maxTreeHeight / svgScaleExtent[0] )
    .attr('x2', 0)
    .attr('y2', 10 * maxTreeHeight / svgScaleExtent[0] );

  separateSections.append('rect')
    .attr('class', (d) => { return 'separatingRect depth_' + (d); })
    .attr('fill-opacity', 0)
    .attr('x', 0)
    .attr('y', -10 * maxTreeHeight / svgScaleExtent[0] )
    .attr('width', (d, i) => {
      return (i === separateSectionsArray.length - 1 ?
        fixedWidth * 5 : fixedWidth);
    })
    .attr('height', 20 * maxTreeHeight / svgScaleExtent[0] );


  // set tree & root location
  tree = d3.tree();

  // collapse nodes if they are in localStorage
  // delete nodes in localStorage that are no longer in the tree
  if (collapseNodesStorage) {
    const nodesCollapsed = [];

    tree(root).descendants().forEach((d) => {
        if (collapseNodesStorage.indexOf(d.data.id) !== -1) {
          collapseNode(d);
          nodesCollapsed.push(d.data.id);
        }
    });

    persistStorage('collapsedNodes', nodesCollapsed);
  }

  // update MapView and QuestionView svgs
  updateMapView(root, false);
  updateQuestionView(jsonTreeData.definition.questions);

  // create context Menu
  createContextMenuForQuestions();

  // if map has not been fully drawn before
  // switch Selected Node
  if (!isMapFullyDrawn && currentNode['id']) {
    switchSelectedNode(currentNode);
  }
  isMapFullyDrawn = true;

  // stay in current position after the rule Document changes
  if (formerZoomTransform) {
    d3.select('svg.ruleMapSvg')
      .call(() => { triggerZoom(true, questionSvgHeight) });
  }
}

/*
 * updates map view
 */
var updateMapView = function(source, hasTransition) {

  // set/change tree size & root location
  if (!includeCollapsedNodesForTreeHeight) {
    treeHeight = d3.max(getDepthWidth()) * fixedHeight;
  }

  /*
   * IN CASE YOU HAVE ANY PROBLEM WITH THE ACTION BUTTONS appearing over
   * the text, uncomment the line below, and comment the line after.
   * However the tree wont look as nice as before.
  */
  // tree = tree().nodeSize([fixedHeight, fixedWidth]);
  tree.size([treeHeight, treeWidth]);

  root.x0  = treeHeight / 2;
  root.y0  = 0;

  // Assigns the x and y position for the nodes
  const treeData = tree(root);

  // compute the new tree layout
  // maps the node data to the tree layout
  nodes = treeData.descendants();
  const links = treeData.descendants().slice(1);

  // normalize for fixed-depth & find currentNode depth (if necessary)
  if (currentNode['depth']) {
    nodes.forEach((d, i) => { d.y = d.depth * fixedWidth; })
  } else {
    nodes.forEach((d, i) => {
      d.y = d.depth * fixedWidth;
      if (d.data.id === currentNode['id']) {
        currentNode['depth'] = d.depth;
      }
    })
  }

  // Update the nodes… their id - will be provided by the id tag on the data
  const node = mapviewSvg.selectAll('g.node')
        .data(nodes, function(d, i) { return d.id = d.data.id; });

  // Enter any new nodes
  // A node group may include: circles, branchName, actions, attachments,
  // and a hover functionality for collapsing
  const nodeEnter = node.enter().append('g')
    .attr('id', (d) => { return 'node_' + d.id; } )
    .attr('class', 'node')
    .classed('disabled', (d) => { return !d.data.active; })
    .attr('transform', function() {
      return 'translate(' + source.y0 + ',' + source.x0 + ')';
    })
    .on('mouseenter', handleNodeMouseenter)
    .on('mouseleave', handleNodeMouseleave);

  // rect to improve hover functionality
  nodeEnter.append('rect')
    .filter( (d) => { return !!(d.children || d._children); })
    .attr('class', 'activateHover')
    .attr('id', (d) => { return 'hoverCircle_' + d.id })
    .attr('x', -30)
    .attr('y', -28)
    .attr('width', 60)
    .attr('height', 56)
    .attr('fill-opacity', 0);

  // add circle around selected Node
  nodeEnter.append('circle')
    .attr('id', (d) => { return 'selectedCircle_' + d.data.id })
    .attr('class', 'highlight')
    .attr('fill-opacity', 0.2)
    .attr('r', 1e-6)
    .style('pointer-events', 'none')
    .style('visibility', 'hidden');

  // add node circles except the action ones
  nodeEnter.append('circle')
    .filter( (d) => { return !!(d.children || d._children); })
    .attr('id', (d) => { return 'nodeCircle_' + d.data.id })
    .attr('class', 'clickable')
    .attr('r', 1e-6)
    .on('click', (d) => { return routeToNode(d); });

  // add collapse '+' sign
  nodeEnter.append('svg:image')
    .filter( (d) => { return !!(d.children || d._children); })
    .attr('xlink:href', getIcon('plus'))
    .attr('class', 'collapsePlusSign')
    .attr('x', '-4px')
    .attr('y', '-4px')
    .attr('height', '8px')
    .attr('width', '8px')
    .style('pointer-events', 'none')
    .style('opacity', 0);

  // add branchTexts with the connection name and
  // a rectangle below to cover the branch, the branch actions and attachments
  const branchGroups = nodeEnter.append('g')
    .filter( (d) => { return d.parent; })
    .attr('class', 'branchGroup')
    .attr('id', (d) => { return 'branchGroup_' + d.data.id; });

  const branchTexts = branchGroups.append('text')
    .attr('x', 0)
    .attr('y', 0)
    .attr('id', (d) => { return 'branchText_' + d.data.id; })
    .attr('class', 'branchText')
    .attr('dy', '.35em')
    .attr('text-anchor', 'middle')
    .attr('fill-opacity', 1e-6)
    .text((d) => { return d.data.parentBranchName; })
    .call(wrapText, fixedWidth - 90, false);

  branchTexts.nodes().forEach( (d, i, array) => {
    const __d = d.__data__,
          groupID = d3.select('#branchGroup_' + __d.data.id),
          bbox = d.getBBox(),
          tspanTotal = d3.select(array[i]).selectAll('tspan').nodes().length,
          lineHeight = 11.25,
          boxPadding = { x: 6, y: 4 },
          xyPadding = {
            x: -(boxPadding.x + bbox.width / 2),
            y: -(boxPadding.y + bbox.height / 2) +
            (lineHeight * (tspanTotal - 1) / 2)
          };

    // append rect all around the text
    groupID.insert('rect', 'text')
      .attr('class', 'branchRect depth_' + (__d.depth - 1))
      .attr('x', 0)
      .attr('y', 0)
      .attr('rx', 5)
      .attr('ry', 5)
      .attr('width', bbox.width + boxPadding.x * 2)
      .attr('height', bbox.height + boxPadding.y * 2)
      .attr('transform', 'translate(' + xyPadding.x + ',' + xyPadding.y + ')')
      .attr('fill-opacity', 1e-6);

    // append actions on top of the text
    groupID.insert('svg:image', 'text')
      .filter(() => { return __d.data.hasParentBranchActions; })
      .attr('xlink:href', getIcon('counter'))
      .attr('x', () => {
        return __d.data.hasParentBranchRationales ? '-17.5' : '-7';
      })
      .attr('y', '-14px')
      .attr('height', '14px')
      .attr('width', '14px')
      .style('opacity', 0)
      .attr('transform', 'translate(0,' + xyPadding.y + ')')
      .attr('class', () => {
        return 'actionIcon branchSourceID_' + __d.parent.id + ' clickable';
      })
      .on('click', () => { return triggerActionOnNode(__d.parent); });

    // append attachments on top of the text
    groupID.insert('svg:image', 'text')
      .filter( () => { return __d.data.hasParentBranchRationales; })
      .attr('xlink:href', getIcon('attachment'))
      .attr('x', () => {
        return __d.data.hasParentBranchActions ? '3.5' : '-7';
      })
      .attr('y', '-14px')
      .attr('height', '14px')
      .attr('width', '14px')
      .style('opacity', 0)
      .attr('transform', 'translate(0,' + xyPadding.y + ')')
      .attr('class', () => {
        return 'attachmentIcon branchSourceID_' + __d.parent.id + ' clickable';
      })
      .on('click', () => { return triggerAttachmentOnNode(__d.parent); });

  });

  // add actionTexts with the details of the action in the end
  const actions = nodeEnter.append('g')
    .filter( (d) => { return !(d.children || d._children); })
    .attr('class', 'action');

  // on actionTexts - each action's description is on a separate line
  actions.nodes().forEach( (d) => {
    const actionArray = (d.__data__.data.actions || []),
          actionTotal = actionArray.length,
          actionHeight = 14;

    // add image icon
    d3.select(d).append('svg:image')
      .attr('xlink:href', getIcon('counter'))
      .attr('class', 'actionIcon clickable')
      .attr('id', 'actionNode_' + d.__data__.id)
      .attr('x', '-7px')
      .attr('y', '-7px')
      .attr('height', '14px')
      .attr('width', '14px')
      .style('opacity', 0)
      .on('click', () => { return routeToNode(d.__data__); });

    const actionGroups = d3.select(d).append('g').attr('class', 'actionGroups');

    // appending multiple texts in the following order:
    //  -- type + title + (score | decision | category)
    actionArray.forEach( (action, index) => {
      const actionGroup = actionGroups.append('g')
        .attr('transform', 'translate(0,' + (index * actionHeight) + ')');

      const actionGroup_text = actionGroup.append('text')
        .attr('dy', '.35em')
        .attr('fill-opacity', 1e-6)
        .attr('text-anchor', 'start');

      actionGroup_text.append('tspan')
        .attr('dx', '2em')
        .attr('class', 'secondary')
        .text( action.type ? (action.type).split('Action')[0] : '' );

      actionGroup_text.append('tspan')
        .attr('dx', '.5em')
        .text( action.title || '' );

      const actionSpecification = (action.score || action.decision ||
          action.category || '');

      actionGroup_text.append('tspan')
        .attr('dx', '.5em')
        .attr('class', 'secondary')
        .text(actionSpecification);
    });

    // place actionGroups centered to the action icon
    actionGroups.attr('transform', 'translate(0,'
      + (-(actionTotal - 1) * actionHeight / 2) + ')');
  });

  // add collapse hover to any node
  const collapseGroup = nodeEnter.append('g')
    .filter( (d) => { return (!!(d.children || d._children)); })
    .attr('transform', 'translate(' + -24 + ', ' + 12 + ')')
    .attr('class', 'clickable')
    .attr('id', (d) => { return 'collapse_' + d.data.id; })
    .style('visibility', 'hidden')
    .on('click', (d) => { return triggerCollapse(d); });

  // rect to improve click functionality
  collapseGroup.append('rect')
    .attr('x', -4)
    .attr('y', -3)
    .attr('width', 58)
    .attr('height', 16)
    .attr('fill-opacity', 0);

  // image and text from collapse
  collapseGroup.append('svg:image')
    .attr('xlink:href', (d) => {
      return (d.data.state === 'closed' ?
        getIcon('expand') : getIcon('collapse')
      );
    })
    .attr('x', '0px')
    .attr('y', '0px')
    .attr('height', '10px')
    .attr('width', '10px');

  collapseGroup.append('text')
    .attr('class', 'secondary')
    .attr('text-anchor', 'start')
    .attr('dx', '.3em')
    .attr('dy', '-.2em')
    .attr('x', '10')
    .attr('y', '10')
    .text((d) => { return d.data.state === 'closed' ? 'expand' : 'collapse' });

  /*
   * for changes in the root document - no transition
   * for others - yes
   * If you want to change this back remove the ? query, and/or set
   * duration or another value (in ms) that you prefer
   */
  const thisUpdateDuration = hasTransition ? duration : 0;

  // UPDATE - with transitions
  const nodeUpdate = nodeEnter.merge(node)
    .transition()
    .duration(thisUpdateDuration);

  // update nodes positions
  nodeUpdate.attr('transform', (d) => {
      return 'translate(' + d.y + ',' + d.x + ')';
    });

  // update circles
  nodeUpdate.select('circle.clickable')
    .filter( (d) => { return !!(d.children || d._children); })
    .attr('r', (d) => { return !d._children ? 7 : 10 });

  nodeUpdate.select('circle.highlight').attr('r', 20);

  // update position of branchText and branchRect
  nodeUpdate.selectAll('g.branchGroup').each( (d, i, array) => {
    const __thisGroup = d3.select(array[i]),
          __thisX = -fixedWidth / 2,
          __thisY = -(d.x - d.parent.x) / 2,
          __lineHeight = 11.25,
          __tspanTotal = __thisGroup.selectAll('tspan').nodes().length;

    __thisGroup.transition()
      .duration(thisUpdateDuration)
      .attr('transform', 'translate(' + __thisX + ', ' +
        (__thisY - __lineHeight * (__tspanTotal - 1) / 2) + ')');
  });
  nodeUpdate.selectAll('text.branchText, rect.branchRect')
    .attr('fill-opacity', 1);

  // update text in final node
  nodeUpdate.selectAll('g.action text').attr('fill-opacity', 1);

  // update collapsed node sign
  nodeUpdate.select('image.collapsePlusSign')
    .style('opacity', (d) => { return !d._children ? 0 : 1 });

  // update action and attachment icons
  nodeUpdate.selectAll('.actionIcon, .attachmentIcon').style('opacity', 1);


  // Transition exiting nodes to the parent's new position.
  const nodeExit = node.exit().transition()
      .duration(thisUpdateDuration)
      .attr('transform', function(d) {
        return 'translate(' + source.y + ',' + source.x + ')';
      })
      .remove();

  // nodeExits for all things
  nodeExit.selectAll('circle').attr('r', 1e-6);
  nodeExit.selectAll('text').attr('fill-opacity', 1e-6);
  nodeExit.selectAll('rect').attr('fill-opacity', 1e-6);
  nodeExit.selectAll('image').style('opacity', 0);


  // Update the links… - same things on the nodes -- id = data.id
  const link = mapviewSvg.selectAll('path.link')
    .data(links, function(d, i) { return d.id = d.data.id; });

  // Enter any new links at the parent's previous position.
  const linkEnter = link.enter().insert('path', 'g')
    .attr('class', 'link')
    .attr('d', function(d) {
      const o = {x: source.x0, y: source.y0 };
      return linkPath(o, o);
    });

  // UPDATE - Transition links to their new position.
  const linkUpdate = linkEnter.merge(link);

  linkUpdate.transition()
    .duration(thisUpdateDuration)
    .attr('d', function(d) { return linkPath(d, d.parent) });

  // Transition exiting nodes to the parent's new position.
  const linkExit = link.exit().transition()
      .duration(thisUpdateDuration)
      .attr('d', function(d) {
      const o = {x: source.x, y: source.y};
      return linkPath(o, o);
      })
      .remove();

  // Store the old positions for transition.
  nodes.forEach( (d) => {
    d.x0 = d.x;
    d.y0 = d.y;
  });

  // correct mapview global group
  translateToRoot[1] = -(root.x0 - containerHeight / 2);
  d3.select('g.mapviewGlobalG').transition().duration(thisUpdateDuration)
    .attr('transform', 'translate(' + translateToRoot + ')');


  function linkPath(child, parent) {
    // delta = child - parent coordinates
    const delta = { x: (child.x - parent.x), y: (child.y - parent.y) };

    /*
     * toggle based on your preference
     *  - 1st: straight diagonal path (current default)
     *  - 2nd: curvilinear diagonal path (basic transformation)
     *  - 3rd: editable linear path
     *  - 4th: editable basic curvilinear path
     *  - 5th: editable steep curvilinear path to write branch names
     *
     *  if you change, then you need to change each branchGroup translate
     */

    return 'M' + child.y + ',' + child.x
      + ' ' + 'L' + parent.y + ',' + parent.x;

    // return 'M' + child.y + ',' + child.x
    //   + 'C' + ((child.y + parent.y) / 2) + ',' + child.x
    //   + ' ' + ((child.y + parent.y) / 2) + ',' + parent.x
    //   + ' ' + parent.y + ',' + parent.x;

    // return 'M' + child.y + ',' + child.x
    //   + ' ' + 'L' + (parent.y + delta.y / 8) + ',' + child.x
    //   + ' ' + 'L' + (parent.y + delta.y / 16) + ',' + parent.x
    //   + ' ' + 'L' + parent.y + ',' + parent.x;

    // return 'M' + child.y + ',' + child.x
    //   + 'C' + (parent.y + delta.y / 8) + ',' + child.x
    //   + ' ' + (parent.y + delta.y / 16) + ',' + parent.x
    //   + ' ' + parent.y + ',' + parent.x;

    // if necessary, change child.x - delta.x for child.x - fixedHeight / smtg
    // return 'M' + child.y + ',' + child.x
    //   + ' ' + 'Q' + (parent.y + delta.y / 8) + ',' + child.x
    //   + ' ' + (parent.y + delta.y / 10) + ',' + (child.x - delta.x / 10)
    //   + ' ' + 'T' + parent.y + ',' + parent.x;

  }
}

/*
 * after zoom reset, this function sets the tree with centered on:
 * y axis - the root position
 * x axis - if possible, in the center of the mapview; else - beginning
 */
var placeTreeInViewportCenter = function() {
  containerWidth = parseInt(d3.select('div#mapView')
          .style('width').split('px')[0], 10);
  containerHeight = parseInt(d3.select('div#mapView')
          .style('height').split('px')[0], 10) - questionSvgHeight;

  translateToRoot = [
    d3.max([(containerWidth - treeWidth + fixedWidth) / 2, 0]) +
      svgMargin.left - 1,
    -(root.x0 - containerHeight / 2)
  ];

  // center questions and mapview on the viewport
  d3.select('g.questionGlobalG').transition().duration(500)
    .attr('transform',
      'translate(' + (translateToRoot[0] - svgMargin.left) + ', 0)');

  d3.select('g.mapviewGlobalG').transition().duration(500)
    .attr('transform',
      'translate(' + translateToRoot + ')');
}

/*
 * compute the amount of nodes on each level
 * it may or may not include the hidden collapsed children
 * (includeCollapsedNodesForTreeHeight)
 */
var getDepthWidth = function() {
  const levelWidth = [1],
        includeCollapsedNodes = includeCollapsedNodesForTreeHeight;

  const childCount = (level, n) => {
    var nodeChildren;
    if (includeCollapsedNodes) {
      nodeChildren = (n.children || n._children || undefined);
    } else {
      nodeChildren = (n.children || undefined);
    }

    if (nodeChildren && nodeChildren.length > 0) {
      if (levelWidth.length <= level + 1) {
        levelWidth.push(0);
      }

      levelWidth[level + 1] += nodeChildren.length;
      nodeChildren.forEach(function(d) {
        childCount(level + 1, d);
      });
    }
  };
  childCount(0, root);
  return levelWidth;
}

/*
 * returns transform for zoom functions
 */
var stringifyTransform = function(transform, isYNull) {
  const yValue = (!isYNull ? transform['y'] : 0);
  return 'translate(' + transform['x'] + ',' + yValue + ') '
    + 'scale(' + transform['k'] + ')';
}

/*
 * TriggerZoom(boolean) pans and zooms the mapView
 * In case of zoom, it also zooms the questionSvg and places the text
 * in the center
 * d3.event.transform: x, y (coordinates), k (scale)
 *
 * When the boolean is true, it resizes the page using the
 * formerZoomTransform value.
 * This is important after rule document changes - as the svg groups are
 * deleted, the viewport information is lost temporarily.
 */
var triggerZoom = function(isRedraw, questionSvgHeight) {

  const _eventTransform = (isRedraw !== true) ?
    d3.event.transform : formerZoomTransform;

  // mapView zoom & horizontal and vertical pan
  d3.select('g.mapviewZoom').attr('transform',
    stringifyTransform(_eventTransform, false));

  // questionSvg zoom & horizontal pan (cancel vertical pan)
  // set all texts to the vertical center of the current scale
  d3.select('g.questionZoom').attr('transform',
    stringifyTransform(_eventTransform, true));
  d3.selectAll('text.questionTitle, text.questionTitle tspan').attr('y',
    questionSvgHeight / (_eventTransform['k'] * 2));

}

/*
 * Mouseenter and mouseleave effects when hovering around a node
 */
var handleNodeMouseenter = function(d, i) {
  d3.select('g#collapse_' + d.data.id).style('visibility', 'visible');
}

var handleNodeMouseleave = function(d, i) {
  d3.select('#collapse_' + d.data.id).style('visibility', 'hidden');
}

/*
 * triggerCollapse -- Toggle children, and stores the collapsed node on the
 * local Storage, while updating the mapView
 */
var triggerCollapse = function(d) {
  // getting collapsedNodes from LocalStorage
  const collapsedNodes = loadStorage('collapsedNodes');
  console.log(collapsedNodes);

  // toggle node state
  if (d.data.state === undefined || d.data.state === 'closed') {
    d.data.state = 'open';

    collapsedNodes.splice(collapsedNodes.indexOf(d.data.id), 1);
    persistStorage('collapsedNodes', collapsedNodes);
  } else {
    d.data.state = 'closed';
    persistStorage('collapsedNodes', [ ...collapsedNodes, d.data.id]);
  }

  collapseNode(d);
  updateMapView(d, true);

  // check if the node selected was collapsed and
  // restores everything back to normal
  if (currentNode['id']) {
    switchSelectedNode(currentNode);
  }
}

/*
 * collapseNode - collapses a Node and changes its text
 */
var collapseNode = function(d) {
  const initialTransition = d3.select('g#collapse_' + d.data.id)
    .transition().duration(duration);
  initialTransition.selectAll('text').attr('fill-opacity', 1e-6)
  initialTransition.selectAll('image').attr('opacity', 0)

  const finalTransition = initialTransition.transition().duration(250);

  if (d.children) {
    d._children = d.children;
    d.children = null;

    finalTransition.selectAll('text').attr('fill-opacity', 1).text('expand');
    finalTransition.selectAll('image').attr('opacity', 1)
      .attr('xlink:href', getIcon('expand'));

  } else {
    d.children = d._children;
    d._children = null;

    finalTransition.selectAll('text').attr('fill-opacity', 1).text('collapse');
    finalTransition.selectAll('image').attr('opacity', 1)
      .attr('xlink:href', getIcon('collapse'));

  }
}

/*
 * switchSelectedNode - switches selected node and its appearance, and area
 * question highlighted
 */
var switchSelectedNode = function(d) {

  const newNodeGroup = 'g#node_' + d.id,
        newBranchSourceIDClass = '.branchSourceID_' + d.id,
        newDepthClass = '.depth_' + d.depth,
        newQuestionText = 'text.questionTitle' + newDepthClass;

  // reset all Nodes, areas Highlighted & question Texts
  mapviewSvg.selectAll('g.node').classed('active', false);
  mapviewSvg.selectAll('g.node' + ' image.actionIcon')
    .attr('xlink:href', getIcon('counter'));
  mapviewSvg.selectAll('g.node' + ' image.attachmentIcon')
    .attr('xlink:href', getIcon('attachment'));
  mapviewSvg.selectAll('g.node' + ' image.collapsePlusSign')
    .attr('xlink:href', getIcon('plus'));
  mapviewSvg.selectAll('circle.highlight').style('visibility', 'hidden');

  mapviewSvg.selectAll('rect.separatingRect')
    .classed('mapViewActive', false);
  mapviewSvg.selectAll('rect.branchRect')
    .classed('branchActive', false);

  questionSvg.selectAll('text.questionTitle').classed('secondary', true);


  // update current Node and area Highlighted
  mapviewSvg.select(newNodeGroup).classed('active', true);
  mapviewSvg.select(newNodeGroup + ' image.collapsePlusSign')
    .attr('xlink:href', getIcon('plus-blue'));
  mapviewSvg.select('circle#selectedCircle_' + d.id)
    .style('visibility', 'visible');

  mapviewSvg.selectAll('rect.separatingRect' + newDepthClass)
    .classed('mapViewActive', true);
  mapviewSvg.selectAll('rect.branchRect' + newDepthClass)
    .classed('branchActive', true);

  questionSvg.select(newQuestionText).classed('secondary', false);

  // update its branches actions and attachments
  mapviewSvg.selectAll('image.actionIcon' + newBranchSourceIDClass)
    .attr('xlink:href', getIcon('counter-blue'));
  mapviewSvg.selectAll('image.attachmentIcon' + newBranchSourceIDClass)
    .attr('xlink:href', getIcon('attachment-blue'));

  // if it is an action node - highlight just this one
  d3.select('image#actionNode_' + d.id)
    .attr('xlink:href', getIcon('counter-blue'));

  // update Previous Node
  currentNode['id'] = d.id;
  currentNode['depth'] = d.depth;

  persistStorage('selectedNode', currentNode);
}

/*
 * checks if in the selection, there is a need for extra lines of text
 * for that particular width
 * if it is a questionTitle, then its position is translated accordingly
 */
var wrapText = function (texts, width, isQuestionTitle) {
  texts.each( (d, i, nodes) => {
    const __thisText = d3.select(nodes[i]),
          words = __thisText.text().split(/\s+/).reverse(),
          lineHeight = 1.1, // ems
          x = __thisText.attr('x'),
          y = __thisText.attr('y'),
          dy = parseFloat(__thisText.attr('dy'));

    var   word,
          tspanLength,
          lineNumber = 0,
          line = [],
          tspan = __thisText.text(null).append('tspan')
            .attr('x', x)
            .attr('y', y)
            .attr('dy', dy + 'em');

    while (word = words.pop()) {
      line.push(word);
      tspan.text(line.join(' '));

      tspanLength = ((tspan.node()).getComputedTextLength() || 0);
      if (tspanLength > width) {
        line.pop();
        tspan.text(line.join(' '));
        line = [word];
        tspan = __thisText.append('tspan')
          .attr('x', x)
          .attr('y', y)
          .attr('dy', ++lineNumber * lineHeight + dy + 'em')
          .text(word);
      }
    }

    // 11.25 is the lineHeight not in em, for multiple lines
    if (isQuestionTitle) {
      __thisText.attr('transform',
        'translate(0, ' + -(11.25 * lineNumber / 2) + ')');
    }
  });
}

/*
 * routeToNode - since routerLinks are not possible in the svg
 * a click function is used to navigate to the new node based on the
 * current Url Path.
 */
var routeToNode = function(d) {
  /*
   * on the actual job, the page would change to perform changes on the node
   */
  /*
    const newRoute = '../' + d.data.id + '/' +
      (d.data.question ? 'options' : 'actions');

    router.navigate([ newRoute ], { relativeTo: route });
  */
  switchSelectedNode(d);
}

/*
 * triggerActionOnNode - triggers Node Action
 * triggerAttachmentOnNode - triggers Node Attachment
 * At the moment - they only redirect to routeToNode
 */
var triggerActionOnNode = function (d) {
  // console.log('Node ' + d.data.id + ' ACTION has been triggered');
  routeToNode(d);
}

var triggerAttachmentOnNode = function (d) {
  // console.log('Node ' + d.data.id + ' ATTACHMENT has been triggered');
  routeToNode(d);
}


/*
 * function to create the question Section on top
 * - places the questions label on top of each node section
 * Can be reused to apply on the bottom of the chart
 */
var updateQuestionView = function(questions) {

  // add questions text and separating line - including Action
  const questionEnter = questionSvg.selectAll('g.questionSection')
    .data([...questions, { 'propertyLabel': 'Action'} ])
    .enter()
    .append('g')
    .style('cursor', 'context-menu')
    .attr('class', 'questionSection');

  // rect to improve interaction - and separate questions
  questionEnter.append('rect')
    .attr('class', 'questionSeparator')
    .attr('x', (d, i) => { return i * fixedWidth; })
    .attr('y', -10 )
    .attr('width', fixedWidth)
    .attr('height', 20 + questionSvgHeight / svgScaleExtent[0] );

  // question Label
  questionEnter.append('text')
    .attr('class', (d, i) => {
      return 'questionTitle depth_' + (i);
    })
    .attr('text-anchor', 'middle')
    .attr('x', (d, i) => { return (( 2 * i + 1) * fixedWidth / 2); })
    .attr('y', questionSvgHeight / 2 )
    .attr('dy', '.3em')
    .style('pointer-events', 'none')
    .text((d) => { return d.propertyLabel; })
    .call(wrapText, fixedWidth - 20, true);
}

/*
 * function to create, set and remove a menu after clicking on a question
 * with this menu you may add a rationale or an action
 */
var createContextMenuForQuestions = function() {

  // context menu
  d3.select('body').on('click', () => {
    if (contextMenuShowing) {
      d3.event.preventDefault();
      d3.select('.questionSvgContextMenu').remove();
      contextMenuShowing = false;
    }
    const d3_target = d3.select(d3.event.target);

    if (d3_target.classed('questionSection') ||
      d3_target.classed('questionSeparator') ||
      d3_target.classed('questionTitle')) {

      d3.event.preventDefault();
      const datum = d3_target.datum(),
            mapViewDiv = d3.select('#mapView'),
            mousePosition = d3.mouse(mapViewDiv.node());

      const contextMenu = mapViewDiv.append('div')
        .attr('class', 'questionSvgContextMenu')
        .style('left', mousePosition[0] + 'px')
        .style('top', mousePosition[1] + 'px');

      contextMenu.append('h4')
        .style('pointer-events', 'none')
        .text(datum['propertyLabel']);

      const listOptions = contextMenu.append('ul')
        .selectAll('.menuOptions')
        .data(['Add Rationale.....', 'Add Action.....'])
        .enter()
          .append('li')
          .attr('class', 'menuOptions')
          .text((d) => { return d; })
          .on('click', (d, i) => {
            d3.event.preventDefault();
            if (i === 0) { triggerAddRationale(datum); }
            if (i === 1) { triggerAddAction(datum); }
            return;
          });

      const mapViewDivSize = [
          (mapViewDiv.node())['offsetWidth'],
          (mapViewDiv.node())['offsetHeight']
      ];

      const contextMenuSize = [
          (contextMenu.node())['offsetWidth'],
          (contextMenu.node())['offsetHeight']
      ];

      if (contextMenuSize[0] + mousePosition[0] > mapViewDivSize[0]) {
          contextMenu.style('left', 'auto');
          contextMenu.style('right', 0);
      }

      if (contextMenuSize[1] + mousePosition[1] > mapViewDivSize[1]) {
          contextMenu.style('top', 0);
      }
      contextMenuShowing = true;
    }

  });
}

/*
 * Menu trigger functions for the questions section
 */
var triggerAddAction = function(d) {
  console.log('triggerAddAction activated for question');
  console.log(d);
}
var triggerAddRationale = function(d) {
  console.log('triggerAddRationale activated for question');
  console.log(d);
}

/*
 * At the moment, this LocalStorage is available until the user logs out
 *
 * It is structured in the case there is a need to add more
 * keys and values on a documentID
 * {
 *    documentID_1: {
 *        collapsedNodes: [...],
 *        parentBranchActions: [...],
 *        parentBranchRationales: [...], 
 *        selectedNode: [id, depth]
 *        ...
 *    },
 *    documentID_2: {
 *        ...
 *    },
 *    ...
 * }
 *
 */


/*
* CREATING THE LOCAL STORAGE TO SAVE THE COLLAPSED NODES (if necessary)
* - to clean localStorage uncomment the line below
*/
var createMapViewLocalStorage = function() {

  // THE LINE BELOW TO RESET STORAGE
  localStorage.setItem( `${prefix}`, JSON.stringify({}));
  
  if (loadStorage('collapsedNodes')) { return; }

  const initialStorage = JSON.parse(localStorage.getItem(`${prefix}`) || {}),
        props = ['selectedNode', 'collapsedNodes', 'parentBranchActions', 'parentBranchRationales'];
  var   currentStorage = Object.assign ( {}, initialStorage);
  
  console.log(initialStorage);
  currentStorage[documentID] = Object.create({});

  props.forEach((prop) => {
    if (prop !== 'selectedNode') {
      currentStorage[documentID][prop] = [];
    } else {
      currentStorage[documentID][prop] = {id: '0', depth: 0}; 
    }
  });
  localStorage.setItem( `${prefix}`, JSON.stringify(currentStorage));
}


/**
 * @method loadStorage
 * This method will load the prop from the localStorage based on the current
 * documentID
 **/
var loadStorage = function(prop) {
  const currentStorage = JSON.parse(localStorage.getItem(`${prefix}`) || {});
  console.log(currentStorage);

  if (!currentStorage || !currentStorage[documentID]) {
    return undefined;
  }
  return currentStorage[documentID][prop];
}
/**
 * @method persistStorage
 * This method saves values to localStorage
 * It may or may not have a expiration Date
 **/
var persistStorage = function(prop, value) {
  try {
    const currentStorage = Object.assign( {},
        JSON.parse(localStorage.getItem(`${prefix}`)));

    currentStorage[documentID][prop] = value;
    localStorage.setItem( `${prefix}`, JSON.stringify(currentStorage) );

  } catch (err) {
    console.error('Cannot access local/session storage:', err);
  }
}

var initDrawMapView = function() {

  d3.json("/data/" + dataset + ".json", function(error, treeData) {
    if (error) throw error;
    console.log(treeData);
    documentID = treeData.document.id;
    decisionTreeLocal = treeData.document.decisionTree;

    console.log(documentID);
    console.log(decisionTreeLocal);

    createMapViewLocalStorage();

    currentNode = loadStorage('selectedNode');

    resetMapView();
    drawMapView();

  });

}

initDrawMapView();
