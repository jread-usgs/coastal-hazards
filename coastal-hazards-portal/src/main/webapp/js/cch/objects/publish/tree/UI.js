/*jslint browser: true*/
/*global $*/
/*global CCH*/
CCH.Objects = CCH.Objects || {};
CCH.Objects.Publish = CCH.Objects.Publish || {};
CCH.Objects.Publish.Tree = CCH.Objects.Publish.Tree || {};
CCH.Objects.Publish.Tree.UI = function (args) {
	"use strict";
	var me = Object.extended();

	$.extend(me, args);

	me.updatedItems = {};
	me.autoSearch = "";
	

	// The individual tree node.
	me.createTreeNode = function (item) {
		var id = item.id,
			text = item.title,
			itemType = item.itemType,
			title = item.title,
			state = {
				'opened': false,
				'itemType': itemType,
				'title': title,
				'original-id': id
			};

		return {
			id: id === 'uber' || id === 'orphans' ? id : CCH.Util.Util.generateUUID(),
			text: text,
			state: state,
			type: itemType,
			children: []
		};
	};

	// Prepare the data that is going tobe fed into the tree UI. This is an iterative
	// process where I have to dive into each of the child items to fully build out 
	// items. The process will call itself many times until I have a fully built out
	// data set ready to go into the tree UI
	me.buildAdjacencyListFromData = function (item) {
		var children = item.children || [],
				node = this.createTreeNode(item),
				referer = CCH.config.referer;

		if (referer && referer === item.id) {
			me.autoSearch = item.title;
		}

		if (children.length) {
			for (var childIndex = 0; childIndex < children.length; childIndex++) {
				var child = children[childIndex];
				var childNode = this.buildAdjacencyListFromData(child);
				node.children.push(childNode);
			}
		}

		return node;
	};

	me.itemUpdated = function (itemId) {
		var node = CCH.ui.getTree().get_node(itemId);

		me.updatedItems[node.id] = node.children;
	};

	// Use the items data to build out the tree UI
	me.createTree = function (itemsArray) {
		me.$treeContainer.jstree({
			'core': {
				'data': itemsArray,
				'check_callback': true
			},
			'contextmenu': {
				'items': {
					'edit': {
						'label' : 'Edit',
						'icon': 'fa fa-pencil-square-o',
						'action' : function () {
							var tree = CCH.ui.getTree(),
								selectedId = tree.get_selected()[0],
								originalId = CCH.ui.getTree().get_node(selectedId).state['original-id'];
						
							window.location = CCH.config.baseUrl + "/publish/item/" + originalId;
						}
					},
					'delete': {
						'label': 'Orphan',
						'icon': 'fa fa-eraser',
						'action': function () {
							var tree = CCH.ui.getTree(),
									selectedId = tree.get_selected()[0],
									parentId = tree.get_parent(selectedId);

							if (selectedId.toLowerCase() !== 'uber') {
								tree.move_node(selectedId, 'orphans');
								me.itemUpdated(parentId);
							}
						}
					}
				}
			},
			'types': {
				'aggregation': {
					'icon': 'fa fa-user-plus'
				},
				'uber': {
					'icon': 'fa fa-users'
				},
				'data': {
					'icon': 'fa fa-user'
				}
			},
			'dnd': {
				'is_draggable': function (evt) {
					if (evt[0].parents.length < 3) {
						return false;
					}
					return true;
				}
			},
			'plugins': ['contextmenu', 'dnd',  'types', 'state', 'search']
		});

		me.$treeContainer.bind({
			'move_node.jstree': function (evt, moveEvt) {
				var oldParent = moveEvt.old_parent,
					newParent = moveEvt.parent;

				// I don't want to allow users to move nodes to the root node. If they 
				// try to, move back to the old node
				if (newParent === 'root') {
					CCH.ui.getTree().move_node(moveEvt.node, oldParent);
				} else {
					[oldParent, newParent].each(function (itemId) {
						me.itemUpdated(itemId);
					});
				}
			},
			'copy_node.jstree' : function (evt, copyEvt) {
				var oldParent = copyEvt.old_parent,
					newParent = copyEvt.parent;
			
				// I don't want to allow users to move nodes to the root node. If they 
				// try to, move back to the old node
				if (newParent === 'root') {
					CCH.ui.getTree().copy_node(copyEvt.original, oldParent);
				} else {
					copyEvt.node.state = copyEvt.original.state;
					copyEvt.node.id = CCH.Util.Util.generateUUID();
					me.itemUpdated(newParent);
				}
			} 
		});
	};

	// When a user hits save, I need to reconstruct the data into the same format
	// as when it came in. This is an iterative process that requires me to dive
	// into each child item. Eventually, out comes a fully built out data set
	// that reflects what the tree currently looks like
	me.buildDataFromJsTreeData = function (data, node, tree) {
		var nodeId = node.id,
				children = [],
				data = data || {};

		if (node.children && node.children.length) {
			for (var cIdx = 0; cIdx < node.children.length; cIdx++) {
				var child = node.children[cIdx],
						childData = me.buildDataFromJsTreeData(null, tree.get_node(child), tree);

				children.push(childData);
			}
		}

		data.id = nodeId;
		data.children = children;
		data.title = node.state.title;
		data.itemType = node.state.itemType;

		return data;
	};

	me.updateRandomIdToOriginalId = function (data) {
		var dataClone = Object.clone(data, true);
		Object.keys(dataClone, function (k, v) {
			dataClone[k] = v.map(function (id) {
				return CCH.ui.getTree().get_node(id).state['original-id'];
			});
			if (k !== 'uber') {
				dataClone[CCH.ui.getTree().get_node(k).state['original-id']] = dataClone[k];
				delete dataClone[k];
			}
			
		});
		return dataClone;
	};

	// User has hit the save button. Reconstruct the data and persist it to the server
	me.saveItems = function () {
		var data = me.updatedItems;

		// Delete the orphans node in the data object if it exists. This is an 
		// artifact of how I build this data. 
		data = me.updateRandomIdToOriginalId(data);
		
		delete data.orphans;
		
		$.ajax(CCH.config.relPath + 'data/tree/item', {
			data: JSON.stringify(data),
			method: 'POST',
			contentType: 'application/json',
			success : function () {
				location.reload();
			},
			error : function () {
				
			}
		});
	};

	// User wants to perform a search in the tree
	me.performTreeSearch = function (evt) {
		var searchCriteria = evt.target.value,
				tree = CCH.ui.getTree();

		if (searchCriteria) {
			tree.search(searchCriteria);
		}
	};

	me.init = function () {
		$.ajax(CCH.config.baseUrl + '/data/tree/item/' + this.id, {
			context: this,
			success: function (item) {
				var parentItem = {
					'id': 'root',
					'itemType': 'root',
					'text': 'Items',
					'children': []
				};

				// First create a data node for the top level item with all children
				parentItem.children.push(this.buildAdjacencyListFromData(item));
				// Use that date to create the tree
				this.createTree([parentItem]);

				this.loadOrphans();
			}
		});

		// Load the orphans object
		me.loadOrphans = function () {
			$.ajax(CCH.config.baseUrl + '/data/tree/item/orphans/', {
				context: this,
				success: function (item) {
					var orphanItem = {
						'id': 'orphans',
						'itemType': 'aggregation',
						'title': 'Orphans',
						'children': item.items
					},
					orphanNode = this.buildAdjacencyListFromData(orphanItem);
					CCH.ui.getTree().create_node('root', orphanNode, 'last');
					if (me.autoSearch) {
						CCH.ui.getTree().search(me.autoSearch, true);
					}
				}
			});
		};

		// Bind the save button
		me.$saveButton.on('click', me.saveItems);

		// Bind the search box
		me.$searchInput.on('keyup', me.performTreeSearch);
	};

	me.init();

	return $.extend(me, {
		getTree: function () {
			return me.$treeContainer.jstree(true);
		}
	});
};