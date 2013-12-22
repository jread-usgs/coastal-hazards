/*jslint browser: true*/
/*global $*/
/*global window*/
/*global OpenLayers*/
/*global CCH*/
/*global ga*/

/**
 * Represents a product as a card
 * 
 * Emits: 
 * window: "item-button-click-bucket-add"
 * window: "item-button-click-bucket-remove"
 * 
 * @param {type} args
 * @returns {CCH.Objects.Card.Anonym$2}
 */
CCH.Objects.Card = function (args) {
    "use strict";
    CCH.LOG.info('Card.js::constructor:Card class is initializing.');

    var me = (this === window) ? {} : this;

    if (!args.item) {
        throw 'A product was not passed into the card constructor';
    }
    me.CARD_TEMPLATE_ID = args.cardTemplateId || 'application-card-template';
    me.AGGREGATION_CONTAINER_CARD = args.aggregationContainerId || 'application-slide-items-aggregation-container-card';
    me.PRODUCT_CONTAINER_CARD = args.productContainerId || 'application-slide-items-product-container-card';
    me.item = args.item;
    me.id = me.item.id;
    me.bbox = me.item.bbox;
    me.type = me.item.type;
    me.itemType = me.item.itemType;
    me.summary = me.item.summary;
    me.name = me.item.name;
    me.attr = me.item.attr;
    me.service = me.item.service;
    me.children = me.item.children || [];
    me.wmsService = me.item.wmsService || {};
    me.wmsEndpoint = me.wmsService.endpoint || '';
    me.wmsLayers = me.wmsService.layers || [];
    me.container = null;
    me.descriptionContainer = null;
    // Is the card hidden by default? We probably want it to be false when creating
    // an accordion bellow but true when creating a card appendage since we will
    // want to have an effect to display it
    me.initHide = args.initHide === false ? false : true;
    // If this card has no parent, it is a top level card - probably an
    // accordion bellow
    me.parent = args.parent;
    me.child = args.child;
    me.layer = me.item.getWmsLayer();

    me.show = function (args) {
        args = args || {};

        var duration = args.duration || 500,
            effect = args.effect || 'slide',
            easing = args.easing || 'swing',
            complete = args.complete || null;

        me.container.show({
            effect : effect,
            easing : easing,
            duration : duration,
            direction : 'up',
            complete : complete
        });

        ga('send', 'event', {
            'eventCategory': 'card', // Required.
            'eventAction': 'show', // Required.
            'eventLabel': me.id
        });
        CCH.LOG.debug('CCH.Objects.Card:: Card ' + me.id + ' was shown');
        $(me).trigger('card-display-toggle', {
            'display' : true
        });

    };

    me.hide = function (args) {
        args = args || {};

        var duration = args.duration || 500,
            effect = args.effect || 'slide',
            easing = args.easing || 'swing',
            complete = args.complete || null;

        me.container.hide({
            effect : effect,
            easing : easing,
            duration : duration,
            direction : 'up',
            complete : complete
        });

        ga('send', 'event', {
            'eventCategory': 'card', // Required.
            'eventAction': 'hide', // Required.
            'eventLabel': me.id
        });
        CCH.LOG.debug('CCH.Objects.Card:: Card ' + me.id + ' was hidden');
        $(me).trigger('card-display-toggle', {
            'display' : false
        });
    };

    me.close = function () {
        // I'd like to send this close command all the way down the chain to my
        // children so they close from the bottom up
        if (me.child) {
            me.child.close();
        }
        // If I have a parent, I am not an accordion item, so I will let my 
        // parent close me
        if (me.parent) {
            // I have a parent, so I am not an accordion item. 
            me.parent.closeChild();
        } else {
            // My parent is an accordion bellow, so we just need to cllck on
            // it to close me
            me.container.parent().parent().parent().find('.panel-heading a').trigger('click');
        }
    };

    me.closeChild = function () {
        me.child.removeSelf();
    };

    me.removeSelf = function () {
        if (me.child) {
            me.child.removeSelf();
        }
        me.hide({
            complete : function () {
                me.container.remove();
            }
        });
    };

    me.bindBucketControl = function (args) {
        var $button = args.button,
            nextAction = args.nextAction,
            add = function () {
                // User pressed bucket button in and wants to add me to a bucket
                $(window).trigger('bucket-add', {
                    item : me.item
                });
            },
            remove = function () {
                // User toggled the bucket button off - I should be removed from 
                // bucket
                $(window).trigger('bucket-remove', {
                    item : me.item
                });
            };

        $button.off();
        if (nextAction === 'add') {
            $button.on('click', add);
        } else {
            $button.on('click', remove);
        }
    };
    
    me.bindAggMenuToResize = function (args) {
        $(window).on('resize', function() {
            var $container = args.container,
            $control = me.container.find('> div:nth-child(2) > div:nth-child(2) > div button:nth-child(2)'),
            bodyWidth = $('body').outerWidth(),
            containerWidth = $container.outerWidth(),
            controlHeight = $control.outerHeight(),
            controlTop = $control.offset().top,
            controlLeft = $control.offset().left,
            top = controlHeight + controlTop, 
            left = controlLeft;
            
            if (controlLeft + containerWidth > bodyWidth) {
                left = bodyWidth - containerWidth;
            }
            
            $container.offset({
                'top' : top,
                'left' : left
            });
            
            $container.css({
                'max-width' : bodyWidth + 'px'
            });
        });
    };
    
    me.bindPropertyAggButton = function ($control) {
        $control.on('click', function ($evt) {
            $evt.stopImmediatePropagation();

            var containerClass = 'aggregation-selection-container',
                $currentContainer = $('body').find('.' + containerClass),
                $container = $('<span />').
                    addClass(containerClass),
                item,
                $list = $('<ul />'),
                createCard = function (id) {
                    // User selected a product. I will append that card to myself
                    var card = new CCH.Objects.Card({
                        item : CCH.items.getById({
                            id : id
                        }),
                        initHide : true,
                        parent : me
                    });

                    // This is now my child card 
                    me.child = card;

                    // Append this new card to myself
                    me.container.after(card.getContainer());

                    // Show this new card to the user
                    card.show();
                },
                processOption = function (item) {
                    var name = item.summary.tiny.title || item.summary.medium.title,
                        $listItem = $('<li />');

                    $listItem.data('id', item.id);
                    $listItem.html(name);
                    $listItem.on('click', function (evt) {
                        var id = $(evt.target).data('id');

                        if (me.child) {
                            // I am going to hide my child first, then remove it
                            me.child.hide({
                                complete: function () {
                                    // Remove my child after it's hidden
                                    me.child.removeSelf();
                                    // Now that my child is gone, I'm going to 
                                    // replace it with a new card
                                    createCard(id);
                                }
                            });
                        } else {
                            // I have no children so I am free to go ahead and 
                            // just create a new child card
                            createCard(id);
                        }
                    });

                    return $listItem;
                };

            if ($currentContainer.length) {
                me.removeAggregationContainer();
            } else {
                $container.append($list);
                $('body').append($container);
                me.children.each(function (child) {
                    if (typeof child === 'string') {
                        item = CCH.items.getById({
                            id : child
                        });

                        if (item) {
                            // The item is already loaded in the items object
                            // so I don't have to go out and get it
                            $list.append(processOption(item));
                        } else {
                            // The item was not already loaded so I will have 
                            // to go out and grab it, processing it once I 
                            // have it.
                            item = new CCH.Objects.Item({ 'id' : child });
                            item.load({
                                callbacks: {
                                    success: [function (item) {
                                        $list.append(processOption(item));
                                    }],
                                    error: [
                                        function (jqXHR, textStatus, errorThrown) {
                                            $.pnotify({
                                                text: 'Could not load sub-item',
                                                styling: 'bootstrap',
                                                type: 'warn',
                                                nonblock: true,
                                                sticker: false,
                                                icon: 'icon-twitter'
                                            });
                                            CCH.LOG.warn('Card:: Could not load ' +
                                                'item. Status Code: ' + textStatus +
                                                ', Error: ' + errorThrown);
                                        }
                                    ]
                                }
                            });
                        }
                    } else {
                        $list.append(processOption(item));
                    }
                });
                
                me.bindAggMenuToResize({
                    container : $container
                });
                
                $(window).trigger('resize');
            }
        });
    };

    me.bindMinMaxButtons = function (control) {
        control.on('click', function (evt) {
            // A user has clicked on my min/max button. 
            // FInd out which one by querying an ancestor that has the 
            // closed/open class on it
            var isOpen = me.container.hasClass('open');

            if (isOpen) {
                me.close();
            } else {
                me.open();
            }
        });
    };
    
    me.removeAggregationContainer = function() {
        $('body').find('.aggregation-selection-container').remove();  
    };
    
    me.createContainer = function () {
        if (!me.container) {
            var container = $('#' + me.CARD_TEMPLATE_ID).clone(true).children(),
                summary = me.summary,
                fullSummary = summary.full,
                mediumSummary = summary.medium,
                tinySummary = summary.tiny,
                largeTitle = fullSummary.title || '',
                mediumTitle = mediumSummary.title || largeTitle,
                largeContent = fullSummary.text || '',
                mediumContent = mediumSummary.text || largeContent,
                mediumTitleContainer = container.find('.application-card-title-container-medium'),
                mediumContentContainer = container.find('.application-card-content-container-medium'),
                minMaxButtons = container.find('.application-card-collapse-icon-container'),
                $buttonRow = container.find('> div:nth-child(2) > div:nth-child(2)'),
                $spaceAggButton = $buttonRow.find('> div button:nth-child(1)'),
                $propertyAggButton = $buttonRow.find('> div button:nth-child(2)'),
                $bucketButton = $buttonRow.find('> div button:nth-child(3)'),
                moreInfoBadge = $('<span />').
                    addClass('badge more-info-badge').
                    append($('<a />').
                        html('More Info').
                        attr({
                            'target' : 'portal_info_window',
                            'href' : window.location.origin + CCH.CONFIG.contextPath + '/ui/info/item/' + me.id
                        })),
                zoomToBadge = $('<span />').
                    addClass('badge zoom-to-badge').
                    html('Zoom To');

            // My container starts out open so I immediately add that class to it
            container.addClass('open');

            // Create Title
            mediumTitleContainer.html(mediumTitle);

            // Create Content
            mediumContentContainer.html(mediumContent);

            // Add badges to content
            mediumContentContainer.append(moreInfoBadge, zoomToBadge);

            // I have either aggregations or leaf nodes as children.
            // I am not myself a child.
            if (me.children.length) {
                me.children.each(function (child) {
                    var option = $('<option />'),
                        item;

                    if (typeof child === 'string') {
                        item = CCH.items.getById(child);

                        if (!item) {
                            // The item was not already loaded so I will have 
                            // to go out and grab it, processing it once I 
                            // have it.
                            new CCH.Objects.Item({ 'id' : child }).load({
                                callbacks: {
                                    success : [],
                                    error: [
                                        function (jqXHR, textStatus, errorThrown) {
                                            $.pnotify({
                                                text: 'Could not load sub-item',
                                                styling: 'bootstrap',
                                                type: 'warn',
                                                nonblock: true,
                                                sticker: false,
                                                icon: 'icon-twitter'
                                            });
                                            CCH.LOG.warn('Card:: Could not load ' +
                                                'item. Status Code: ' + textStatus +
                                                ', Error: ' + errorThrown);
                                        }
                                    ]
                                }
                            });
                        }
                    }
                });

                // Do bindings
                me.bindPropertyAggButton($propertyAggButton);
                zoomToBadge.on('click', function () {
                    CCH.map.zoomToBoundingBox({
                        bbox : me.bbox,
                        fromProjection : new OpenLayers.Projection('EPSG:4326')
                    });
                });
            } else {
                // This is a leaf node so don't add an aggregation button
                $propertyAggButton.remove();
            }

            // Do bindings
            me.bindBucketControl({
                button : $bucketButton,
                nextAction : 'add'
            });
            me.bindMinMaxButtons(minMaxButtons);

            // I start with my container hidden and an upstream process will
            // decide when to show me
            if (me.initHide) {
                container.css({
                    display : 'none'
                });
            }

            me.container = container;
        }
        return me.container;
    };
    
    $(window).on({
        'click': function(evt) {
            me.removeAggregationContainer(evt);
        },
        'cch.ui.redimensioned': function(evt) {
            me.removeAggregationContainer(evt);
        },
        'bucket-added': function (evt, args) {
            if (args.id === me.id) {
                var $button = me.container.find('> div:nth-child(2) > div:nth-child(2) > div button:nth-child(3)'),
                    $img = $button.find('>img');

                $img.attr('src', 'images/cards/subtract-bucket.svg');
                me.bindBucketControl({
                    button : $button,
                    nextAction : 'remove'
                });
            }
        },
        'bucket-removed': function (evt, args) {
            if (args.id === me.id) {
                var $button = me.container.find('> div:nth-child(2) > div:nth-child(2) > div button:nth-child(3)'),
                    $img = $button.find('>img');

                $img.attr('src', 'images/cards/add-bucket.svg');
                me.bindBucketControl({
                    button : $button,
                    nextAction : 'add'
                });
            }
        }
    });

    CCH.LOG.info('Card.js::constructor:Card class is initialized.');

    return {
        id: me.id,
        item: me.item,
        show : me.show,
        hide : me.hide,
        close : me.close,
        child : me.child,
        closeChild : me.closeChild,
        removeSelf : me.removeSelf,
        layer : me.layer,
        getBoundingBox: function () {
            return me.bbox;
        },
        getContainer: me.createContainer
    };

};
