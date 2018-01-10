// imports for mapview
import { select, selectAll, Selection, event as d3.event, mouse as d3.mouse } from 'd3-selection';
import 'd3-transition';
import { tree, hierarchy } from 'd3-hierarchy';
import { zoom, zoomIdentity } from 'd3-zoom';
import { max as d3.max, min as d3.min } from 'd3-array';

// imports for LocalStorage - find
import { InternalStorage } from 'shared/api/storage/storage.swaps';

import 'd3';
export class RulesMapComponent {
  private dataset = "small_dataset";

  private prefix = '$userRuleDocument$';
  private documentID: string;

  private decisionTreeLocal: any;
  private currentNode: object = { id: undefined, depth: undefined };
  private previousNode: object = { id: undefined, depth: undefined };

  private treeHeight = 0;
  private treeWidth = 0;
  private isMapFullyDrawn = false;

  private contextMenuShowing = false;

  private tree: any;
  private root: any;
  private nodes: any;
  private questionSvg: any;
  private mapviewSvg: any;
  private separateSections: any;
  private containerWidth;
  private containerHeight;
  private translateToRoot = [0, 0];

  // transitions and listeners
  private duration = 750;
  private zoomListener: any;
  private formerZoomTransform: any;

  // fixed variables
  private fixedWidth = 200;
  private questionSvgHeight = 50;
  private svgScaleExtent: [number, number] = [0.15, 4];
  private svgMargin = { top: 20, right: 120, bottom: 20, left: 35 };
  /*
   * toogle this one based on your preference:
   *  - includeCollapsedNodesForTreeHeight - is a boolean to whether include or
   *  not the collapsed nodes to calculate the tree height.
   *  - if true, 100 is fine; if false, fixedHeight should be a bit higher
   */
  private includeCollapsedNodesForTreeHeight = false;
  /* good values - [100, 150] */
  private fixedHeight = 140;

  // private Variables important for mapview
  private getIcon(iconName: string) {
    const icons_pwd = 'assets/mapview-icons/';
    return icons_pwd + iconName + '.svg';
  }

  public ngOnInit() {
    this.initDrawMapView();
  }


  private initDrawMapView() {

    d3.json("/data/" + this.dataset + ".json", function(error, treeData) {
      if (error) throw error;
      this.documentID = treeData.document.id;
      this.decisionTreeLocal = treeData.document.decisionTree;

      // IMPORTANT
      // get from local storage - selectedNode in this chart & nodes with actions
      // 
      // set previous node, depth
      this.previousNode['id'] = '0'; 
      this.previousNode['depth'] = '1';

      this.createMapViewLocalStorage();

      this.resetMapView();
      this.drawMapView();

      // MAYBE???
      if (this.isMapFullyDrawn) {
        this.switchSelectedNode(this.previousNode);
      }
    });
  }

  /*
   * if map was fully drawn and there is a change on the rule document
   * remove all elements inside the mapView svgs
   */
  private resetMapView() {
    if (this.isMapFullyDrawn) {
      d3.select('g.questionZoom').remove();
      d3.select('g.mapviewZoom').remove();
      d3.select('g.zoomBtnGroup').remove();
      this.isMapFullyDrawn = false;
    }
  }

  /*
   * draws map view
   */
  private drawMapView() {

    const jsonTreeData = this.decisionTreeLocal;

    // currentStorage represents throughout the document the collapsed nodes
    // for this chart
    const collapseNodesStorage = this.loadStorage('collapsedNodes');
    // const parentBranchActionsStorage = this.loadStorage('parentBranchActions');
    // const parentBranchRationalesStorage = this.loadStorage('parentBranchRationales');


    // MISSING selected node storage, nodes with actions, attachments

    // setting the d3.hierarchy
    this.root = d3.hierarchy(jsonTreeData.root, (d) => {
      return (!d.connections ? [] : d.connections.map((c, i) => {
        // transfering data from the connections Node to a newNode for d3
        // handling, plus adding branch name and options from the connection

        let isNodeIdInStorage = false,
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
    this.root.data.state = (collapseNodesStorage &&
      collapseNodesStorage.indexOf(this.root.data.id) !== -1 ? 'closed' : 'open');

    // zoomListener function
    this.zoomListener = d3.zoom().scaleExtent(this.svgScaleExtent)
      .on('end', () => {
        this.formerZoomTransform = d3.event.transform;
      })
      .on('zoom', () => { this.triggerZoom(false, this.questionSvgHeight) });

    // private const variables - predetermined
    const svgMargin = this.svgMargin,
          fixedWidth = this.fixedWidth,
          fixedHeight = this.fixedHeight;

    /*
     * set svgs and tree Height and width
     * compute the new height, based on amount of nodes on a level
     */
    const maxTreeHeight = d3.max(this.getDepthWidth()) * fixedHeight,
          svgWidth = '100%',
          svgHeight = '100%';

    this.treeHeight = maxTreeHeight;
    this.treeWidth = fixedWidth * (this.root.height + 2);
    this.containerWidth = (this.containerWidth || window.screen.width);
    this.containerHeight = (this.containerHeight ||
            0.5 * window.screen.height - 120);
    this.translateToRoot[0] = svgMargin.left - 1 + d3.max([
      (this.containerWidth - this.treeWidth + fixedWidth) / 2, 0
    ]);

    // center questions and mapview on the viewport
    // questionSvg setup
    this.questionSvg = d3.select('div#mapView svg.questionMapSvg')
      .attr('width', svgWidth)
      .attr('height', this.questionSvgHeight)
        .append('g')
        .attr('class', 'questionZoom')
          .append('g')
          .attr('class', 'questionGlobalG')
          .attr('transform', 'translate(' +
            (this.translateToRoot[0] - svgMargin.left) + ', ' + 0 + ')'
          );

    // mapView setup
    this.mapviewSvg = d3.select('svg.ruleMapSvg')
      .style('width', svgWidth)
      .style('height', svgHeight)
      .style('min-height', '50px')
      .call(this.zoomListener)
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
    const svgToBeZoomed: any  = d3.select('svg.ruleMapSvg');
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
            .call(this.zoomListener.scaleBy, 1.5);
        }
        if (d === 'zoomOut') {
          svgToBeZoomed.transition().duration(500)
            .call(this.zoomListener.scaleBy, 0.7);
        }
        if (d === 'zoomReset') {
          svgToBeZoomed.transition().duration(500)
            .call(this.zoomListener.transform,
              d3.zoomIdentity.scale(1).translate(0, 0));

          this.placeTreeInViewportCenter();
        }
      });

    zoomBtnGroups.append('rect')
      .attr('height', zoomBtnWidth)
      .attr('width', zoomBtnWidth);

    zoomBtnGroups.append('svg:image')
      .attr('xlink:href', (d) => {
       if (d === 'zoomIn') { return this.getIcon('plus'); }
       if (d === 'zoomReset') { return this.getIcon('center'); }
       return this.getIcon('less');
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

    this.separateSections = this.mapviewSvg.selectAll('g.mapSection')
      .data(separateSectionsArray)
      .enter()
      .append('g')
      .attr('class', 'mapSection')
      .attr('transform', (d, i) => {
        return 'translate(' + (i * fixedWidth - svgMargin.left) + ', ' + 0 + ')';
      });

    this.separateSections.append('line')
      .attr('class', 'mapSeparator')
      .attr('stroke-opacity', 0.5)
      .attr('x1', 0)
      .attr('y1', -10 * maxTreeHeight / this.svgScaleExtent[0] )
      .attr('x2', 0)
      .attr('y2', 10 * maxTreeHeight / this.svgScaleExtent[0] );

    this.separateSections.append('rect')
      .attr('class', (d) => { return 'separatingRect depth_' + (d); })
      .attr('fill-opacity', 0)
      .attr('x', 0)
      .attr('y', -10 * maxTreeHeight / this.svgScaleExtent[0] )
      .attr('width', (d, i) => {
        return (i === separateSectionsArray.length - 1 ?
          fixedWidth * 5 : fixedWidth);
      })
      .attr('height', 20 * maxTreeHeight / this.svgScaleExtent[0] );


    // set tree & root location
    this.tree = d3.tree();

    // collapse nodes if they are in localStorage
    // delete nodes in localStorage that are no longer in the tree
    if (collapseNodesStorage) {
      const nodesCollapsed = [];

      this.tree(this.root).descendants().forEach((d) => {
          if (collapseNodesStorage.indexOf(d.data.id) !== -1) {
            this.collapseNode(d);
            nodesCollapsed.push(d.data.id);
          }
      });

      this.persistStorage('collapsedNodes', nodesCollapsed);
    }

    // update MapView and QuestionView svgs
    this.updateMapView(this.root, false);
    this.updateQuestionView(jsonTreeData.definition.questions);

    // create context Menu
    this.createContextMenuForQuestions();

    // if map has not been fully drawn before
    // switch Selected Node
    if (!this.isMapFullyDrawn && this.previousNode['id']) {
      this.switchSelectedNode(this.previousNode);
    }
    this.isMapFullyDrawn = true;

    // stay in current position after the rule Document changes
    if (this.formerZoomTransform) {
      d3.select('svg.ruleMapSvg')
        .call(() => { this.triggerZoom(true, this.questionSvgHeight) });
    }
  }

  /*
   * updates map view
   */
  private updateMapView(source: any, hasTransition: boolean) {

    const fixedWidth = this.fixedWidth;

    // set/change tree size & root location
    if (!this.includeCollapsedNodesForTreeHeight) {
      this.treeHeight = d3.max(this.getDepthWidth()) * this.fixedHeight;
    }

    /*
     * IN CASE YOU HAVE ANY PROBLEM WITH THE ACTION BUTTONS appearing over
     * the text, uncomment the line below, and comment the line after.
     * However the tree wont look as nice as before.
    */
    // this.tree = tree().nodeSize([fixedHeight, fixedWidth]);
    this.tree.size([this.treeHeight, this.treeWidth]);

    this.root.x0  = this.treeHeight / 2;
    this.root.y0  = 0;

    // Assigns the x and y position for the nodes
    const treeData = this.tree(this.root);

    // compute the new tree layout
    // maps the node data to the tree layout
    this.nodes = treeData.descendants();
    const links = treeData.descendants().slice(1);

    // normalize for fixed-depth & find currentNode depth (if necessary)
    if (this.previousNode['depth']) {
      this.nodes.forEach((d, i) => { d.y = d.depth * this.fixedWidth; })
    } else {
      this.nodes.forEach((d, i) => {
        d.y = d.depth * this.fixedWidth;
        if (d.data.id === this.previousNode['id']) {
          this.previousNode['depth'] = d.depth;
        }
      })
    }

    // Update the nodes… their id - will be provided by the id tag on the data
    const node = this.mapviewSvg.selectAll('g.node')
          .data(this.nodes, function(d, i) { return d.id = d.data.id; });

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
      .on('mouseenter', this.handleNodeMouseenter)
      .on('mouseleave', this.handleNodeMouseleave);

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
      .on('click', (d) => { return this.routeToNode(d); });

    // add collapse '+' sign
    nodeEnter.append('svg:image')
      .filter( (d) => { return !!(d.children || d._children); })
      .attr('xlink:href', this.getIcon('plus'))
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
      .call(this.wrapText, this.fixedWidth - 90, false);

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
        .attr('xlink:href', this.getIcon('counter'))
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
        .on('click', () => { return this.triggerActionOnNode(__d.parent); });

      // append attachments on top of the text
      groupID.insert('svg:image', 'text')
        .filter( () => { return __d.data.hasParentBranchRationales; })
        .attr('xlink:href', this.getIcon('attachment'))
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
        .on('click', () => { return this.triggerAttachmentOnNode(__d.parent); });

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
        .attr('xlink:href', this.getIcon('counter'))
        .attr('class', 'actionIcon clickable')
        .attr('id', 'actionNode_' + d.__data__.id)
        .attr('x', '-7px')
        .attr('y', '-7px')
        .attr('height', '14px')
        .attr('width', '14px')
        .style('opacity', 0)
        .on('click', () => { return this.routeToNode(d.__data__); });

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
      .on('click', (d) => { return this.triggerCollapse(d); });

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
          this.getIcon('expand') : this.getIcon('collapse')
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
     * this.duration or another value (in ms) that you prefer
     */
    const thisUpdateDuration = hasTransition ? this.duration : 0;

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
    const link = this.mapviewSvg.selectAll('path.link')
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
    this.nodes.forEach( (d) => {
      d.x0 = d.x;
      d.y0 = d.y;
    });

    // correct mapview global group
    this.translateToRoot[1] = -(this.root.x0 - this.containerHeight / 2);
    d3.select('g.mapviewGlobalG').transition().duration(thisUpdateDuration)
      .attr('transform', 'translate(' + this.translateToRoot + ')');


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
  private placeTreeInViewportCenter() {
    this.containerWidth = parseInt(d3.select('div#mapView')
            .style('width').split('px')[0], 10);
    this.containerHeight = parseInt(d3.select('div#mapView')
            .style('height').split('px')[0], 10) - this.questionSvgHeight;

    this.translateToRoot = [
      d3.max([(this.containerWidth - this.treeWidth + this.fixedWidth) / 2, 0]) +
        this.svgMargin.left - 1,
      -(this.root.x0 - this.containerHeight / 2)
    ];

    // center questions and mapview on the viewport
    d3.select('g.questionGlobalG').transition().duration(500)
      .attr('transform',
        'translate(' + (this.translateToRoot[0] - this.svgMargin.left) + ', 0)');

    d3.select('g.mapviewGlobalG').transition().duration(500)
      .attr('transform',
        'translate(' + this.translateToRoot + ')');
  }

  /*
   * compute the amount of nodes on each level
   * it may or may not include the hidden collapsed children
   * (includeCollapsedNodesForTreeHeight)
   */
  private getDepthWidth() {
    const levelWidth = [1],
          includeCollapsedNodes = this.includeCollapsedNodesForTreeHeight;

    const childCount = (level, n) => {
      let nodeChildren;
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
    childCount(0, this.root);
    return levelWidth;
  }

  /*
   * returns transform for zoom functions
   */
  private stringifyTransform(transform: any, isYNull: boolean) {
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
  private triggerZoom(isRedraw: boolean, questionSvgHeight: number) {

    const _eventTransform = (isRedraw !== true) ?
      d3.event.transform : this.formerZoomTransform;

    // mapView zoom & horizontal and vertical pan
    d3.select('g.mapviewZoom').attr('transform',
      this.stringifyTransform(_eventTransform, false));

    // questionSvg zoom & horizontal pan (cancel vertical pan)
    // set all texts to the vertical center of the current scale
    d3.select('g.questionZoom').attr('transform',
      this.stringifyTransform(_eventTransform, true));
    selectAll('text.questionTitle, text.questionTitle tspan').attr('y',
      questionSvgHeight / (_eventTransform['k'] * 2));

  }

  /*
   * Mouseenter and mouseleave effects when hovering around a node
   */
  private handleNodeMouseenter(d: any, i: any) {
    d3.select('g#collapse_' + d.data.id).style('visibility', 'visible');
  }

  private handleNodeMouseleave(d: any, i: any) {
    d3.select('#collapse_' + d.data.id).style('visibility', 'hidden');
  }

  /*
   * triggerCollapse -- Toggle children, and stores the collapsed node on the
   * local Storage, while updating the mapView
   */
  private triggerCollapse(d: any) {
    // getting collapsedNodes from LocalStorage
    const collapsedNodes = this.loadStorage('collapsedNodes');

    // toggle node state
    if (d.data.state === undefined || d.data.state === 'closed') {
      d.data.state = 'open';

      collapsedNodes.splice(collapsedNodes.indexOf(d.data.id), 1);
      this.persistStorage('collapsedNodes', collapsedNodes);
    } else {
      d.data.state = 'closed';
      this.persistStorage('collapsedNodes', [ ...collapsedNodes, d.data.id]);
    }

    this.collapseNode(d);
    this.updateMapView(d, true);

    // check if the node selected was collapsed and
    // restores everything back to normal
    if (this.previousNode['id']) {
      this.switchSelectedNode(this.previousNode);
    }
  }

  /*
   * collapseNode - collapses a Node and changes its text
   */
  private collapseNode(d) {
    const initialTransition = d3.select('g#collapse_' + d.data.id)
      .transition().duration(this.duration);
    initialTransition.selectAll('text').attr('fill-opacity', 1e-6)
    initialTransition.selectAll('image').attr('opacity', 0)

    const finalTransition = initialTransition.transition().duration(250);

    if (d.children) {
      d._children = d.children;
      d.children = null;

      finalTransition.selectAll('text').attr('fill-opacity', 1).text('expand');
      finalTransition.selectAll('image').attr('opacity', 1)
        .attr('xlink:href', this.getIcon('expand'));

    } else {
      d.children = d._children;
      d._children = null;

      finalTransition.selectAll('text').attr('fill-opacity', 1).text('collapse');
      finalTransition.selectAll('image').attr('opacity', 1)
        .attr('xlink:href', this.getIcon('collapse'));

    }
  }

  /*
   * switchSelectedNode - switches selected node and its appearance, and area
   * question highlighted
   */
  private switchSelectedNode(d) {

    const newNodeGroup = 'g#node_' + d.id,
          newBranchSourceIDClass = '.branchSourceID_' + d.id,
          newDepthClass = '.depth_' + d.depth,
          newQuestionText = 'text.questionTitle' + newDepthClass;

    // reset all Nodes, areas Highlighted & question Texts
    this.mapviewSvg.selectAll('g.node').classed('active', false);
    this.mapviewSvg.selectAll('g.node' + ' image.actionIcon')
      .attr('xlink:href', this.getIcon('counter'));
    this.mapviewSvg.selectAll('g.node' + ' image.attachmentIcon')
      .attr('xlink:href', this.getIcon('attachment'));
    this.mapviewSvg.selectAll('g.node' + ' image.collapsePlusSign')
      .attr('xlink:href', this.getIcon('plus'));
    this.mapviewSvg.selectAll('circle.highlight').style('visibility', 'hidden');

    this.mapviewSvg.selectAll('rect.separatingRect')
      .classed('mapViewActive', false);
    this.mapviewSvg.selectAll('rect.branchRect')
      .classed('branchActive', false);

    this.questionSvg.selectAll('text.questionTitle').classed('secondary', true);


    // update current Node and area Highlighted
    this.mapviewSvg.select(newNodeGroup).classed('active', true);
    this.mapviewSvg.select(newNodeGroup + ' image.collapsePlusSign')
      .attr('xlink:href', this.getIcon('plus-blue'));
    this.mapviewSvg.select('circle#selectedCircle_' + d.id)
      .style('visibility', 'visible');

    this.mapviewSvg.selectAll('rect.separatingRect' + newDepthClass)
      .classed('mapViewActive', true);
    this.mapviewSvg.selectAll('rect.branchRect' + newDepthClass)
      .classed('branchActive', true);

    this.questionSvg.select(newQuestionText).classed('secondary', false);

    // update its branches actions and attachments
    this.mapviewSvg.selectAll('image.actionIcon' + newBranchSourceIDClass)
      .attr('xlink:href', this.getIcon('counter-blue'));
    this.mapviewSvg.selectAll('image.attachmentIcon' + newBranchSourceIDClass)
      .attr('xlink:href', this.getIcon('attachment-blue'));

    // if it is an action node - highlight just this one
    d3.select('image#actionNode_' + d.id)
      .attr('xlink:href', this.getIcon('counter-blue'));

    // update Previous Node
    this.previousNode['id'] = d.id;
    this.previousNode['depth'] = d.depth;
  }

  /*
   * checks if in the selection, there is a need for extra lines of text
   * for that particular width
   * if it is a questionTitle, then its position is translated accordingly
   */
  private wrapText (texts, width, isQuestionTitle) {
    texts.each( (d, i, nodes) => {
      const __thisText = d3.select(nodes[i]),
            words = __thisText.text().split(/\s+/).reverse(),
            lineHeight = 1.1, // ems
            x = __thisText.attr('x'),
            y = __thisText.attr('y'),
            dy = parseFloat(__thisText.attr('dy'));

      let   word,
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

        tspanLength = ((tspan.node() as any).getComputedTextLength() || 0);
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
  private routeToNode(d) {
    const newRoute = '../' + d.data.id + '/' +
      (d.data.question ? 'options' : 'actions');

    this.router.navigate([ newRoute ], { relativeTo: this.route });
  }

  /*
   * triggerActionOnNode - triggers Node Action
   * triggerAttachmentOnNode - triggers Node Attachment
   * At the moment - they only redirect to routeToNode
   */
  private triggerActionOnNode (d) {
    // console.log('Node ' + d.data.id + ' ACTION has been triggered');
    this.routeToNode(d);
  }

  private triggerAttachmentOnNode (d) {
    // console.log('Node ' + d.data.id + ' ATTACHMENT has been triggered');
    this.routeToNode(d);
  }


  /*
   * function to create the question Section on top
   * - places the questions label on top of each node section
   * Can be reused to apply on the bottom of the chart
   */
  private updateQuestionView(questions: any) {
    const fixedWidth = this.fixedWidth,
          questionSvgHeight = this.questionSvgHeight;

    // add questions text and separating line - including Action
    const questionEnter = this.questionSvg.selectAll('g.questionSection')
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
      .attr('height', 20 + questionSvgHeight / this.svgScaleExtent[0] );

    // question Label
    questionEnter.append('text')
      .attr('class', (d, i) => {
        return 'questionTitle depth_' + (i) + ' secondary';
      })
      .attr('text-anchor', 'middle')
      .attr('x', (d, i) => { return (( 2 * i + 1) * fixedWidth / 2); })
      .attr('y', questionSvgHeight / 2 )
      .attr('dy', '.4em')
      .style('pointer-events', 'none')
      .text((d) => { return d.propertyLabel; })
      .call(this.wrapText, this.fixedWidth - 20, true);
  }

  /*
   * function to create, set and remove a menu after clicking on a question
   * with this menu you may add a rationale or an action
   */
  private createContextMenuForQuestions() {

    // context menu
    d3.select('body').on('click', () => {
      if (this.contextMenuShowing) {
        d3.event.preventDefault();
        d3.select('.questionSvgContextMenu').remove();
        this.contextMenuShowing = false;
      }
      const d3_target = d3.select(d3.event.target);

      if (d3_target.classed('questionSection') ||
        d3_target.classed('questionSeparator') ||
        d3_target.classed('questionTitle')) {

        d3.event.preventDefault();
        const datum = d3_target.datum(),
              mapViewDiv = d3.select('#mapView'),
              mousePosition = d3.mouse(mapViewDiv.node() as any);

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
              if (i === 0) { this.triggerAddRationale(datum); }
              if (i === 1) { this.triggerAddAction(datum); }
              return;
            });

        const mapViewDivSize = [
            (mapViewDiv.node() as any)['offsetWidth'],
            (mapViewDiv.node() as any)['offsetHeight']
        ];

        const contextMenuSize = [
            (contextMenu.node() as any)['offsetWidth'],
            (contextMenu.node() as any)['offsetHeight']
        ];

        if (contextMenuSize[0] + mousePosition[0] > mapViewDivSize[0]) {
            contextMenu.style('left', 'auto');
            contextMenu.style('right', 0);
        }

        if (contextMenuSize[1] + mousePosition[1] > mapViewDivSize[1]) {
            contextMenu.style('top', 0);
        }
        this.contextMenuShowing = true;
      }

    });
  }

  /*
   * Menu trigger functions for the questions section
   */
  private triggerAddAction(d) {
    console.log('triggerAddAction activated for question');
    console.log(d);
  }
  private triggerAddRationale(d) {
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
  private createMapViewLocalStorage() {

    // THE LINE BELOW TO RESET STORAGE
    // localStorage.set( `${this.prefix}`, {});
    if (this.loadStorage(prop)) { return; }

    const initialStorage = (JSON.parse(localStorage.getItem(`${this.prefix}`)) || undefined),
          props = ['selectedNode', 'collapsedNodes', 'parentBranchActions', 'parentBranchRationales'];
    let   resultStorage: object;

    if (initialStorage) {
      resultStorage = Object.assign ( {}, initialStorage);
    } else {
      resultStorage = Object.create ( {} );
    }
    resultStorage[this.documentID] = Object.create({});

    for(var prop in props) {
      resultStorage[this.documentID][prop] = [];
    }
    localStorage.setItem( `${this.prefix}`, JSON.stringify(resultStorage));
  }


  /**
   * @method loadStorage
   * This method will load the prop from the localStorage based on the current
   * documentID
   **/
  private loadStorage(prop: string): any {
    const currentStorage = (JSON.parse(localStorage.getItem(`${this.prefix}`)) || undefined);

    if (!currentStorage || !currentStorage[this.documentID]) {
      return undefined;
    }
    return currentStorage[this.documentID][prop];
  }
  /**
   * @method persistStorage
   * This method saves values to localStorage
   * It may or may not have a expiration Date
   **/
  private persistStorage(prop: string, value: any, expires?: Date): void {
    try {
      const currentStorage: object = Object.assign( {},
          JSON.parse(localStorage.getItem(`${this.prefix}`)));

      currentStorage[this.documentID][prop] = value;
      localStorage.setItem( `${this.prefix}`, JSON.stringify(resultStorage) );

    } catch (err) {
      console.error('Cannot access local/session storage:', err);
    }
  }
}
