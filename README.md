# Interactive Data Tree for Startup - Demo

**Demo Link** (in GitHub Pages): https://tiagomms.github.io/Collapsible_Tree_Demo/ 

Developed in Nov - Dec 2017, I developed an interactive and collapsible tree in D3 for a startup. The data tree worked as an interactive map to add new branches, actions and attachments to each branch. The original work was written in Typescript on top of an AngularJs v4 and Node js API.

In this demo, I transcribed the code to Javascript and the data is retrieved from JSON files. I added in d3 a menu below to add action and attachments icons that are saved in the local storage, along with the selected node and nodes that were collapsed.

On this demo, you can:
- Zoom in and out by scrooling or the using the buttons in the top right corner
- Drag the mapview using your mouse
- Reset your zoom in/out on the middle button in the top right corner
- Change Dataset on the bottom menu
- Collapse and expand nodes when hovering a node
- Select nodes, which changes the menu below
- On the bottom menu, add action and/or attachment icons to the branches of the selected node 
- Open a context menu after clicking on the labels on top of the tree. On clicking the menu, it triggers fake events.

*Disclaimer:* This demo uses mock data. It is merely for visualisation purposes.

