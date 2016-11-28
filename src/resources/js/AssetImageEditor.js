/**
 * Asset image editor class
 */

// TODO: When rotating by 90 degrees, the cropping constraint acts like the image has not been rotated
// TODO: Maybe namespace all the attributes?
// TODO: Go over each attribute and method to make sure it's used at all.
// TODO: Rename and maybe refactor misleading names for methods. _scaleAndCenterImage(), for example. It does other stuff too.

Craft.AssetImageEditor = Garnish.Modal.extend(
	{
		// jQuery objects
		$body: null,
		$footer: null,
		$tools: null,
		$buttons: null,
		$cancelBtn: null,
		$replaceBtn: null,
		$saveBtn: null,
		$editorContainer: null,
		$straighten: null,
		$croppingCanvas: null,

		// References and parameters
		canvas: null,
		image: null,
		viewport: null,
		viewportMask: null,
		assetId: null,
		cacheBust: null,
		zoomRatio: 1,

		// Cropping references
		croppingCanvas: null,
		clipper: null,
		croppingRectangle: null,
		cropperHandles: null,
		croppingShade: null,
		tiltedImageVerticeCoords: null,
		isCroppingPerformed: false,
		cropData: {},

		// Cropping event-related references
		draggingCropper: false,
		scalingCropper: false,
		previousMouseX: 0,
		previousMouseY: 0,
		lockAspectRatio: false,

		// Filters
		appliedFilter: null,
		appliedFilterOptions: {},

		// Editor parameters
		editorHeight: 0,
		editorWidth: 0,
		viewportWidth: 0,
		viewportHeight: 0,

		// Image attributes
		imageAngle: 0,
		imageStraightenAngle: 0,
		viewportRotation: 0,
		originalWidth: 0,
		originalHeight: 0,

		// Animation
		animationInProgress: false,

		init: function (assetId, settings) {
			this.cacheBust = Date.now();

			this.setSettings(settings, Craft.AssetImageEditor.defaults);

			this.assetId = assetId;

			// Build the modal
			this.$container = $('<form class="modal fitted imageeditor"></form>').appendTo(Garnish.$bod),
				this.$body = $('<div class="body"></div>').appendTo(this.$container),
				this.$footer = $('<div class="footer"/>').appendTo(this.$container);

			this.base(this.$container, this.settings);

			this.$buttons = $('<div class="buttons rightalign"/>').appendTo(this.$footer);
			this.$cancelBtn = $('<div class="btn cancel">' + Craft.t('app', 'Cancel') + '</div>').appendTo(this.$buttons);
			this.$replaceBtn = $('<div class="btn submit save replace">' + Craft.t('app', 'Replace Asset') + '</div>').appendTo(this.$buttons);

			if (this.settings.allowSavingAsNew) {
				this.$saveBtn = $('<div class="btn submit save copy">' + Craft.t('app', 'Save as New Asset') + '</div>').appendTo(this.$buttons);
			}

			this.addListener(this.$cancelBtn, 'activate', $.proxy(this, 'hide'));
			this.removeListener(this.$shade, 'click');

			this.updateRequestedImageSize();

			Craft.postActionRequest('assets/image-editor', $.proxy(this, 'loadEditor'));
		},

		updateRequestedImageSize: function () {
			var browserViewportWidth = Garnish.$doc.get(0).documentElement.clientWidth,
				browserViewportHeight = Garnish.$doc.get(0).documentElement.clientHeight;

			this.requestedImageSize = Math.min(browserViewportHeight, browserViewportWidth);
		},

		loadEditor: function (data) {
			this.$body.html(data.html);
			this.$tabs = $('.tabs li', this.$body);
			this.$viewsContainer = $('.views', this.$body);
			this.$views = $('> div', this.$viewsContainer);
			this.$imageTools = $('.image-container .image-tools', this.$body);
			this.straighteningInput = new SlideRuleInput("slide-rule");

			this.$editorContainer = $('.image-container .image', this.$body);
			this.editorHeight = this.$editorContainer.innerHeight();
			this.editorWidth = this.$editorContainer.innerWidth();

			this.updateSizeAndPosition();

			this.canvas = new fabric.StaticCanvas('image-canvas', {backgroundColor: this.backgroundColor, hoverCursor: 'default'});
			this.canvas.enableRetinaScaling = true;

			// TODO add loading spinner
			// TODO make sure small images are not scaled up
			// TODO Make sure that retina works

			// Load the image from URL
			var imageUrl = Craft.getActionUrl('assets/edit-image', {assetId: this.assetId, size: this.requestedImageSize, cacheBust: this.cacheBust});

			fabric.Image.fromURL(imageUrl, $.proxy(function (imageObject) {

				this.image = imageObject;

				this.originalHeight = this.image.getHeight();
				this.originalWidth = this.image.getWidth();
				this.zoomRatio = 1;

				this.image.set({
					originX: 'center',
					originY: 'center'
				});

				this.canvas.add(this.image);

				// Scale the image and center it on the canvas
				this._scaleAndCenterImage();

				// Add listeners to buttons and draw the grid
				this._addControlListeners();

				// Render it, finally
				this.canvas.renderAll();
			}, this));
		},

		updateSizeAndPosition: function()
		{
			// TODO if sizing up significantly from starting size, load a higher-res image if available
			if (!this.$container)
			{
				return;
			}

			// Fullscreen modal

			var innerWidth = window.innerWidth;
			var innerHeight = window.innerHeight;

			this.$container.css({
				'width':      innerWidth,
				'min-width':  innerWidth,
				'left':       0,

				'height':     innerHeight,
				'min-height': innerHeight,
				'top':        0
			});

			this.$body.css({
				'height':     innerHeight - 58,
			});

			if(innerWidth < innerHeight)
			{
				this.$container.addClass('vertical');
			}
			else
			{
				this.$container.removeClass('vertical');
			}

			// If editor is loaded, update those dimensions
			if (this.$editorContainer) {
				// If image is already loaded, make sure it looks pretty.
				if (this.image) {
					this._scaleAndCenterImage();
				}
			}
		},

		/**
		 * Scale and center the image in the editor
		 */
		_scaleAndCenterImage: function () {

			this.editorHeight = this.$editorContainer.innerHeight();
			this.editorWidth = this.$editorContainer.innerWidth();

			this.canvas.setDimensions({
				width: this.editorWidth,
				height: this.editorHeight
			});

			var imageDimensions = this.getScaledImageDimensions();

			this.image.height = imageDimensions.height;
			this.image.width = imageDimensions.width;

			// TODO take into account crop performed
			this.image.set({
				left: this.editorWidth / 2,
				top: this.editorHeight / 2
			});

			this.canvas.renderAll();

			this._setImageVerticeCoordinates();
		},

		hasOrientationChanged: function () {
			return this.viewportRotation % 180 != 0;
		},

		getScaledImageDimensions: function () {
			var imageRatio = this.originalHeight / this.originalWidth;
			var editorRatio = this.editorHeight / this.editorWidth;

			var dimensions = {};
			if (this.hasOrientationChanged()) {
				imageRatio = 1 / imageRatio;
				if (imageRatio > editorRatio) {
					dimensions.width = this.editorHeight;
					dimensions.height = Math.round(this.originalHeight * (this.editorHeight / this.originalWidth));
				} else {
					dimensions.height = this.editorWidth;
					dimensions.width = Math.round(this.originalWidth / (this.originalHeight / this.editorWidth));
				}
			} else {
				if (imageRatio > editorRatio) {
					dimensions.height = this.editorHeight;
					dimensions.width = Math.round(this.originalWidth / (this.originalHeight / this.editorHeight));
				} else {
					dimensions.width = this.editorWidth;
					dimensions.height = Math.round(this.originalHeight * (this.editorWidth / this.originalWidth));
				}
			}

			return dimensions;
		},

		/**
		 * Renew the image's zoom ratio.
		 * @private
		 */
		_renewImageZoomRatio: function () {
			this.image.scale(this.zoomRatio);
		},

		/**
		 * Create the cropping mask so that the image is cropped to viewport when rotating
		 *
		 * @returns fabric.Rect
		 */
		_createViewportMask: function (dimensions) {
			var mask = new fabric.Rect({
				width: dimensions.width,
				height: dimensions.height,
				fill: '#000',
				left: dimensions.left + (dimensions.width / 2),
				top: dimensions.top + (dimensions.height / 2),
				originX: 'center',
				originY: 'center'
			});
			mask.globalCompositeOperation = 'destination-in';
			return mask;
		},

		/**
		 * Add listeners to buttons
		 */
		_addControlListeners: function () {

			// Tabs
			this.addListener(this.$tabs, 'click', '_handleTabClick');

			// Controls
			this.addListener($('.rotate-left'), 'click', function (ev) {
				this.rotateImage(-90);
			}.bind(this));

			this.addListener($('.rotate-right'), 'click', function (ev) {
				this.rotateImage(90);
			}.bind(this));

			// Controls
			this.addListener($('.flip-vertical'), 'click', function (ev) {
				this.flipImage('y');
			}.bind(this));

			this.addListener($('.flip-horizontal'), 'click', function (ev) {
				this.flipImage('x');
			}.bind(this));


			//this.ratioMenu = this.$ratioBtn.menubtn().data('menubtn').menu;
			//this.ratioMenu.on('optionselect', $.proxy(this, '_handleRatioChange'));
			//this.ratioMenu.$options.first().trigger('click');

			this.$tabs.first().trigger('click');
			return;
			// Generate a callback function that checks if the control is active beforehand
			/*
			 var _callIfControlActive = function (callback) {
			 return function (ev) {
			 if (this.isActiveControl($(ev.currentTarget))) {
			 callback.call(this, ev);
			 } else {
			 ev.preventDefault();
			 ev.stopPropagation();
			 }
			 }.bind(this);
			 }.bind(this);

			 this.addListener($('.rotate.counter-clockwise'), 'click', _callIfControlActive(function (ev) {
			 this.rotateViewport(-90);
			 }));
			 this.addListener($('.rotate.clockwise'),'click', _callIfControlActive(function (ev) {
			 this.rotateViewport(90);
			 }));

			 this.addListener($('.rotate.reset'), 'click', _callIfControlActive(function (ev) {
			 this.resetStraighten(ev);
			 }));
			 this.addListener($('.rotate.straighten'), 'input change mouseup mousedown click', _callIfControlActive(function (ev) {
			 this.straighten(ev);
			 }));

			 this.addListener($('.filter-select select', this.$tools), 'change', _callIfControlActive(function (ev) {
			 $option = $(ev.currentTarget).find('option:selected');
			 $('.filter-fields').addClass('hidden');
			 if ($option.val()) {
			 $('.filter-fields[filter=' + $option.val() + ']').removeClass('hidden');
			 }
			 }));
			 this.addListener($('.filter-tools .btn.apply-filter', this.$tools), 'click', _callIfControlActive(function (ev) {
			 this.applyFilter(ev);
			 }));

			 this.addListener($('.cropping-tool', this.$tools), 'click', _callIfControlActive(function (ev) {
			 this.enableCropMode(ev);
			 }));
			 this.addListener($('.reset-crop', this.$tools), 'click', _callIfControlActive(function (ev) {
			 this.cancelCropMode(ev);
			 }));
			 this.addListener($('.apply-crop', this.$tools), 'click', _callIfControlActive(function (ev) {
			 this.applyCrop(ev);
			 }));

			 this.addListener($('.btn.cancel', this.$buttons), 'click', $.proxy(this, 'hide'));
			 this.addListener($('.btn.save', this.$buttons), 'click', $.proxy(this, 'saveImage'));

			 this.addListener(Garnish.$doc, 'keydown', function (ev)
			 {
			 if (ev.keyCode == Garnish.SHIFT_KEY) {
			 this.lockAspectRatio = true;
			 }
			 }.bind(this));
			 this.addListener(Garnish.$doc, 'keyup', function (ev)
			 {
			 if (ev.keyCode == Garnish.SHIFT_KEY) {
			 this.lockAspectRatio = false;
			 }
			 }.bind(this));*/
		},

		_handleTabClick: function(ev)
		{
			var $tab = $(ev.currentTarget);
			var view = $tab.data('view');
			this.$tabs.removeClass('selected');
			$tab.addClass('selected');
			this.showView(view);
		},

		showView: function(view)
		{
			this.$views.addClass('hidden');
			var $view = this.$views.filter('[data-view="'+view+'"]');
			$view.removeClass('hidden');
			if ($view.data('transform')) {
				this.enableTransformMode();
			} else {
				this.disableTransformMode();
			}
		},

		/**
		 * Rotate the image along with the cropping mask.
		 *
		 * @param integer degrees
		 */
		rotateImage: function (degrees) {

			// TODO Since more than one method is using this, maybe make it a "reguestAnimationSlot" or something.
			if (!this.animationInProgress) {
				if (degrees % 90 != 0) {
					return false;
				}

				this.animationInProgress = true;
				this.viewportRotation += degrees;

				// Normalize the viewport rotation angle so it's between 0 and 359
				this.viewportRotation = parseInt((this.viewportRotation + 360) % 360, 10);

				var imageDimensions = this.getScaledImageDimensions();
				var newAngle = this.image.getAngle() + degrees;

				// Animate the rotations
				this.image.animate({
					angle: newAngle,
					width: imageDimensions.width,
					height: imageDimensions.height
				}, {
					onChange: this.canvas.renderAll.bind(this.canvas),
					duration: this.settings.animationDuration,
					onComplete: $.proxy(function () {
						// Clean up angle
						var cleanAngle = parseInt((this.image.getAngle() + 360) % 360, 10);
						this.image.set({angle: cleanAngle});
						this.animationInProgress = false;

						this._scaleAndCenterImage();
					}, this)
				});
			}
		},

		flipImage: function (scale) {
			if (!this.animationInProgress) {
				this.animationInProgress = true;

				if (this.hasOrientationChanged()) {
					scale = scale == 'y' ? 'x' : 'y';
				}

				var properties = {};

				if (scale == 'y') {
					var properties = {
						scaleY: this.image.scaleY * -1
					};
				} else {
					var properties = {
						scaleX: this.image.scaleX * -1
					};
				}

				this.image.animate(properties, {
					onChange: this.canvas.renderAll.bind(this.canvas),
					duration: this.settings.animationDuration,
					onComplete: $.proxy(function () {
						this.animationInProgress = false;
						this._scaleAndCenterImage();
					}, this)
				});
			}
		},

		/**
		 * Perform the straightening by slider
		 *
		 * @param Event ev
		 */
		straighten: function (ev) {
			if (!this.animationInProgress) {
				this.discardCrop();
				this.animationInProgress = true;

				if (ev) {
					if (ev.type == 'change' || ev.type == 'click') {
						this.hideGrid();
					} else {
						this.showGrid();
					}
				}

				this.imageStraightenAngle = parseInt(this.$straighten.val(), 10) % 360;

				this._prepareImageForRotation();

				// Straighten the image
				this.image.set({
					angle: this.imageStraightenAngle
				});

				this.zoomRatio = this.getZoomToCoverRatio();
				this._renewImageZoomRatio();
				this._destroyCropper();

				this.canvas.renderAll();

				this.animationInProgress = false;
			}
		},

		/**
		 * Reset the straighten degrees
		 *
		 * @param Event ev
		 */
		resetStraighten: function (ev) {
			if (this.animationInProgress) {
				return;
			}

			this.$straighten.val(0);
			this.straighten();
		},

		/**
		 * Save the image.
		 *
		 * @param Event ev
		 */
		saveImage: function (ev) {

			$button = $(ev.currentTarget);
			if ($button.hasClass('disabled')) {
				return false;
			}

			$('.btn', this.$buttons).addClass('disabled');
			this.$buttons.append('<div class="spinner"></div>');

			var postData = {
				assetId: this.assetId,
				viewportRotation: this.viewportRotation,
				imageRotation: this.imageStraightenAngle,
				replace: $button.hasClass('replace') ? 1 : 0
			};

			var filterHandle = this.appliedFilter;

			if (filterHandle) {
				postData.filter = filterHandle;
				var filterOptions = this.appliedFilterOptions;

				for (var option in filterOptions) {
					postData['filterOptions[' + option + ']'] = encodeURIComponent(filterOptions[option]);
				}
			}

			if (this.isCroppingPerformed) {
				postData.cropData = this.cropData;
			}

			Craft.postActionRequest('assets/save-image', postData, $.proxy(function (data) {
				this.$buttons.find('.btn').removeClass('disabled').end().find('.spinner').remove();
				this.onSave();
				//this.hide();
			}, this));
		},

		/**
		 * Return image zoom ratio depending on the straighten angle to cover the viewport fully
		 */
		getZoomToCoverRatio: function () {
			// Convert the angle to radians
			var angleInRadians = Math.abs(this.imageStraightenAngle) * (Math.PI / 180);

			// Calculate the dimensions of the scaled image using the magic of math
			var scaledWidth = Math.sin(angleInRadians) * this.viewportHeight + Math.cos(angleInRadians) * this.viewportWidth;
			var scaledHeight = Math.sin(angleInRadians) * this.viewportWidth + Math.cos(angleInRadians) * this.viewportHeight;

			// Calculate the ratio
			return Math.max(scaledWidth /  this.viewportWidth, scaledHeight / this.viewportHeight);
		},

		/**
		 * Return image zoom ratio depending on the straighten angle to fit inside the viewport
		 */
		getZoomToFitRatio: function () {
			// Convert the angle to radians
			var angleInRadians = Math.abs(this.imageStraightenAngle) * (Math.PI / 180);
			var scaledHeight;
			var scaledWidth;

			// Use straight triangles and substitution to get an expression that equates to scaled height
			if (this.originalWidth > this.originalHeight) {
				var proportion = this.originalWidth / this.originalHeight;
				var scaledHeight = this.editorWidth / (Math.cos(angleInRadians) * proportion + Math.sin(angleInRadians));
				var scaledWidth = scaledHeight * proportion;
			} else {
				var proportion = this.originalHeight / this.originalWidth;
				var scaledWidth = this.editorHeight / (Math.sin(angleInRadians) + Math.cos(angleInRadians) * proportion);
				var scaledHeight = scaledWidth * proportion;
			}

			// Calculate the ratio using the longest edge against editor width, since editor always will be square
			return Math.max(scaledWidth, scaledHeight) / this.editorWidth;
		},

		/**
		 * Return the combined zoom ratio to fit a rectangle inside image that's been zoomed to fit.
		 */
		getCombinedZoomRatio: function () {
			return this.getZoomToCoverRatio() / this.getZoomToFitRatio();
		},

		/**
		 * Draw the grid.
		 *
		 * @private
		 */
		_drawGrid: function () {
			var strokeOptions = {
				strokeWidth: this.settings.gridLineThickness,
				opacity: 1,
				stroke: this.settings.gridLineColor
			};

			var imageWidth = this.viewportWidth,
				imageHeight = this.viewportHeight;

			// draw Frame;
			var gridLines = [
				new fabric.Line([0, 0, imageWidth - 1, 0], strokeOptions),
				new fabric.Line([0, imageHeight - 1, 0, 0], strokeOptions),
				new fabric.Line([imageWidth - 1, 0, imageWidth - 1, imageHeight - 1], strokeOptions),
				new fabric.Line([imageWidth, imageHeight - 1, 0, imageHeight - 1], strokeOptions)
			];

			/**
			 * This function takes a length of a dimension, divides it in two, draws a line and recursively calls
			 * itself on both of the new segments.
			 */
			var divideAndDraw = $.proxy(function (divisionLevel, dimensionToDivide, offset, lineLength, axis) {

				var divisionPoint = Math.ceil(dimensionToDivide / 2 - this.settings.gridLineThickness / 2 + offset);

				// Set the start/end points depending on the axis we're drawing along
				if (axis == 'x') {
					pointOptions = [0, divisionPoint, lineLength, divisionPoint];
				} else {
					pointOptions = [divisionPoint, 0, divisionPoint, lineLength];
				}

				// Ensure the opacity gradually decreases
				strokeOptions.opacity = 1 - ((divisionLevel - 1) * (1 / this.settings.gridLinePrecision));

				gridLines.push(new fabric.Line(pointOptions, strokeOptions));

				// If we're not done yet, divide and conquer both new segments
				if (divisionLevel < this.settings.gridLinePrecision) {
					divideAndDraw(divisionLevel + 1, dimensionToDivide / 2, offset, lineLength, axis);
					divideAndDraw(divisionLevel + 1, dimensionToDivide / 2, offset + dimensionToDivide / 2, lineLength, axis);
				}
			}, this);

			divideAndDraw(1, imageWidth, 0, imageHeight, 'y');
			divideAndDraw(1, imageHeight, 0, imageWidth, 'x');

			this.grid = new fabric.Group(gridLines, {
				left: this.image.left - this.settings.gridLineThickness,
				top: this.image.top - this.settings.gridLineThickness,
				opacity: 0
			});

			this.viewport.add(this.grid);
		},

		/**
		 * Show the grid
		 */
		showGrid: function () {
			this.grid.set({opacity: 1});
		},

		/**
		 * Hide the grid
		 */
		hideGrid: function () {
			this.grid.set({opacity: 0});
		},

		onFadeOut: function () {
			this.destroy();
		},

		/**
		 * Apply a selected filter.
		 */
		applyFilter: function (ev) {

			$button = $(ev.currentTarget);
			if ($button.hasClass('disabled')) {
				return false;
			}

			$button.addClass('disabled');

			$spinner = $('<div class="spinner filter-spinner"></div>').insertAfter($button);

			var getParams = {
				assetId: this.assetId,
				size: this.settings.assetSize
			};

			var filterHandle = this.getSelectedFilter();

			if (filterHandle) {
				var filterOptions = this.getFilterOptions(filterHandle);

				// No use in requesting same image again.
				if (filterHandle == this.appliedFilter && JSON.stringify(this.appliedFilterOptions) == JSON.stringify(filterOptions)) {
					$spinner.remove();
					$button.removeClass('disabled');
					return;
				}

				this.appliedFilter = filterHandle;
				this.appliedFilterOptions = filterOptions;

				getParams.filter = filterHandle;

				for (var option in filterOptions) {
					getParams['filterOptions[' + option + ']'] = encodeURIComponent(filterOptions[option]);
				}

			} else {
				// No use in requesting same image again.
				if (this.appliedFilter == null) {
					$spinner.remove();
					$button.removeClass('disabled');
					return;
				}

				this.appliedFilterOptions = {};
				this.appliedFilter = null;
			}

			imageUrl = Craft.getActionUrl('assets/edit-image', getParams);

			this.image.setSrc(imageUrl, $.proxy(function (imageObject) {
				this._scaleAndCenterImage();
				this._prepareImageForRotation();
				$spinner.remove();
				$button.removeClass('disabled');
			}, this));
		},

		/**
		 * Get the currently selected filter's handle
		 */
		getSelectedFilter: function () {
			return $('.filter-select', this.$tools).find('option:selected').val();
		},

		/**
		 * Get the filter options by a filter handle
		 * @param filterHandle
		 */
		getFilterOptions: function (filterHandle) {
			var filterParams = {};
			$filterFields = $('.filter-fields[filter=' + filterHandle + ']').find('input, select, textarea');
			$filterFields.each(function () {
				$input = $(this);
				filterParams[$input.prop('name')] = encodeURIComponent($input.val());
			});

			return filterParams;
		},

		onSave: function () {
			this.settings.onSave();
		},

		isActiveControl: function ($element) {
			return $element.parents('.disabled').length == 0;
		},

		enableTransformMode: function () {
			this.$imageTools.removeClass('hidden');
		},

		disableTransformMode: function () {
			this.$imageTools.addClass('hidden');
		},

		enableCropMode: function () {

			this.zoomRatio = this.getZoomToFitRatio();

			var callback = function () {
				$('.cropping-tools .crop-mode-enabled', this.$tools).removeClass('hidden');
				$('.cropping-tools .crop-mode-disabled', this.$tools).addClass('hidden');
				this.canvas.renderAll();
			}.bind(this);

			this.discardCrop(true);
			this.showCropper();
			this._switchEditingMode({mode: 'crop', onFinish: callback});

			this.viewportMask.animate({
				width: this.editorWidth,
				height: this.editorHeight
			}, {
				duration: this.settings.animationDuration
			});

			this.canvas.renderAll();
		},

		cancelCropMode: function () {
			this.zoomRatio = this.getZoomToCoverRatio();

			var callback = function () {
				$('.rotation-tools, .filter-tools', this.$tools).removeClass('disabled');
				$('.cropping-tools .crop-mode-enabled', this.$tools).addClass('hidden');
				$('.cropping-tools .crop-mode-disabled', this.$tools).removeClass('hidden');

				this.canvas.renderAll();
			}.bind(this);

			this.hideCropper();
			this._switchEditingMode({mode: 'edit', onFinish: callback});

			this.viewportMask.animate({
				width: this.viewportWidth,
				height: this.viewportHeight
			}, {
				duration: this.settings.animationDuration
			});

			this.canvas.renderAll();
		},

		discardCrop: function (skipAnimation) {
			if (this.isCroppingPerformed) {

				// Reset image position
				this._scaleAndCenterImage();

				// Reset rotation origin
				this._prepareImageForRotation();

				// Re-set the viewport mask size
				var properties = {
					width: this.viewportWidth,
					height: this.viewportHeight,
					top: this.image.top - 1,
					left: this.image.left - 1
				};

				// A special case is when discarding crop info and going straight
				// to crop mode. The switching to crop mode animates the viewport,
				// so we don't so we do not interfere.
				if (skipAnimation) {
					this.viewportMask.set(properties);
				} else {
					this.viewportMask.animate(properties,{
						duration: this.settings.animationDuration,
						onChange: this.canvas.renderAll.bind(this.canvas)
					});
				}

				this.canvas.renderAll();

				this.cropData = {};

				this.isCroppingPerformed = false;
			}
		},

		applyCrop: function () {

			var clipperWidth = this.clipper.width;
			var clipperHeight = this.clipper.height;

			// Compensate for frame stroke thickness
			var clipperCenter = {
				x: this.clipper.left + (clipperWidth / 2) + 2,
				y: this.clipper.top + (clipperHeight / 2) + 2,
			};


			var deltaX = clipperCenter.x - this.editorWidth / 2;
			var deltaY = clipperCenter.y - this.editorHeight / 2;

			// Morph the viewport to match the clipper
			this.viewportMask.animate({
				width: clipperWidth,
				height: clipperHeight
			}, {
				duration: this.settings.animationDuration
			});

			this.image.animate({
				left: this.image.left - deltaX,
				top: this.image.top - deltaY
			},{
				onComplete: function () {
					$('.rotation-tools, .filter-tools', this.$tools).removeClass('disabled');
					$('.cropping-tools .crop-mode-enabled', this.$tools).addClass('hidden');
					$('.cropping-tools .crop-mode-disabled', this.$tools).removeClass('hidden');
				}.bind(this),
				onChange: this.canvas.renderAll.bind(this.canvas),
				duration: this.settings.animationDuration});

			this.hideCropper();

			var cropperBorderThickness = this.settings.cropperBorderThickness;
			var leftOffset;
			var topOffset;

			// If the image has not been straightened, then we probably have some
			// space on top/bottom or left/right edges.
			if (this.imageStraightenAngle == 0) {
				var leftOffset = Math.round((this.editorWidth - this.image.width) / 2);
				var topOffset = Math.round((this.editorHeight - this.image.height) / 2);
			} else {
				var leftOffset = 0;
				var topOffset = 0;
			}

			// When passing along the coordinates, take into account the possible excess space on edge of editor
			this.cropData = {
				width: this.clipper.width,
				height: this.clipper.height,
				cornerLeft: Math.max(Math.round(this.clipper.left - leftOffset - this.tiltedImageVerticeCoords.c.x), 0),
				cornerTop: Math.max(Math.round(this.clipper.top - topOffset - this.tiltedImageVerticeCoords.d.y), 0),
				scaledWidth: this.image.width,
				scaledHeight: this.image.height,
				zoomRatio: this.getZoomToFitRatio()
			};

			this.isCroppingPerformed = true;
		},

		_switchEditingMode: function (settings) {
			$('.rotation-tools, .filter-tools, .cropping-tools', this.$tools).addClass('disabled').find('select').prop('disabled', true);

			if (settings.mode == 'crop') {
				var selector = '.cropping-tools';
			} else {
				var selector = '.cropping-tools, .rotation-tools, .filter-tools';
			}

			this.image.animate({
				scaleX: this.zoomRatio,
				scaleY: this.zoomRatio
			}, {
				onChange: this.canvas.renderAll.bind(this.canvas),
				duration: this.settings.animationDuration,
				onComplete: $.proxy(function () {
					$(selector, this.$tools).removeClass('disabled').find('select').prop('disabled', false);
					settings.onFinish();
				}, this)
			});
		},

		showCropper: function () {
			this._drawCropper();
			this._setTiltedVerticeCoordinates();
			this._redrawCropperBoundaries();

			this.croppingCanvas.on({
				'mouse:down': this._handleMouseDown.bind(this),
				'mouse:move': this._handleMouseMove.bind(this),
				'mouse:up': this._handleMouseUp.bind(this)
			});
		},

		hideCropper: function () {
			if (this.clipper) {
				this.croppingCanvas.remove(this.clipper);
				this.croppingCanvas.remove(this.croppingShade);
				this.croppingCanvas.remove(this.cropperHandles);
				this.croppingCanvas.remove(this.croppingRectangle);
				this.croppingCanvas.off({
					'mouse:down': this._handleMouseDown.bind(this),
					'mouse:move': this._handleMouseMove.bind(this),
					'mouse:up': this._handleMouseUp.bind(this)
				});
			}
		},

		_drawCropper: function () {
			var strokeThickness = this.settings.cropperBorderThickness;

			this.croppingCanvas = new fabric.Canvas('cropping-canvas', {backgroundColor: 'rgba(0,0,0,0)', hoverCursor: 'default', selection: false});
			this.$croppingCanvas = $('#cropping-canvas', this.$editorContainer);

			this.croppingCanvas.setDimensions({
				width: this.editorWidth,
				height: this.editorHeight
			});

			$('.canvas-container', this.$editorContainer).css({position: 'absolute', top: 0, left: 0});

			this.croppingShade = new fabric.Rect({
				width: this.editorWidth,
				height: this.editorHeight,
				fill: 'rgba(255,255,255,0.4)',
				left: 0,
				top: 0
			});

			this.croppingShade.set({
				hasBorders: false,
				hasControls: false,
				selectable: false
			});

			// calculate the cropping rectangle size.
			var rectangleRatio = this.imageStraightenAngle == 0 ? 1.2 : this.getCombinedZoomRatio() * 1.2,
				rectWidth = this.viewportWidth / rectangleRatio,
				rectHeight = this.viewportHeight / rectangleRatio;

			// Set up the cropping viewport rectangle.
			//var croppingGroup = [];
			this.clipper = new fabric.Rect({
				left: Math.round(this.editorWidth / 2 - rectWidth / 2) - strokeThickness,
				top: Math.round(this.editorHeight / 2 - rectHeight / 2) - strokeThickness,
				width: rectWidth,
				height: rectHeight,
				stroke: 'black',
				fill: 'rgba(128,0,0,1)',
				strokeWidth: 0,
				hasBorders: false,
				hasControls: false,
				selectable: false
			});

			this.clipper.globalCompositeOperation = 'destination-out';
			this.croppingCanvas.add(this.croppingShade);
			this.croppingCanvas.add(this.clipper);
		},

		_redrawCropperBoundaries: function () {
			if (this.cropperHandles) {
				this.croppingCanvas.remove(this.cropperHandles);
				this.croppingCanvas.remove(this.croppingRectangle);
			}

			var lineOptions = {
				strokeWidth: 2,
				stroke: 'rgb(255,255,255)',
				fill: false
			};

			var pathGroup = [];
			var path = new fabric.Path('M 0,10 L 0,0 L 10,0');
			path.set(lineOptions);
			pathGroup.push(path);
			var path = new fabric.Path('M '+(this.clipper.width-8)+',0 L '+(this.clipper.width+4)+',0 L '+(this.clipper.width+4)+',10');
			path.set(lineOptions);
			pathGroup.push(path);
			var path = new fabric.Path('M '+(this.clipper.width+4)+','+(this.clipper.height-8)+' L'+(this.clipper.width+4)+','+(this.clipper.height+4)+' L '+(this.clipper.width-8)+','+(this.clipper.height+4));
			path.set(lineOptions);
			pathGroup.push(path);
			var path = new fabric.Path('M 10,'+(this.clipper.height+4)+' L 0,'+(this.clipper.height+4)+' L 0,'+(this.clipper.height-8));
			path.set(lineOptions);
			pathGroup.push(path);

			this.cropperHandles = new fabric.Group(pathGroup, {
				left: this.clipper.left - 2,
				top: this.clipper.top - 2,
				hasBorders: false,
				hasControls: false,
				selectable: false
			});


			this.croppingRectangle = new fabric.Rect({
				left: this.clipper.left,
				top: this.clipper.top,
				width: this.clipper.width,
				height: this.clipper.height,
				fill: 'rgba(0,0,0,0)',
				stroke: 'rgba(255,255,255,0.8)',
				strokeWidth: 2,
				hasBorders: false,
				hasControls: false,
				selectable: false
			});

			this.croppingCanvas.add(this.cropperHandles);
			this.croppingCanvas.add(this.croppingRectangle);
			this.croppingCanvas.renderAll();
		},

		_handleMouseDown: function (options) {

			var handle = this._cropperHandleHitTest(options.e);
			var move = this._cropperHitTest(options.e);
			if (handle || move) {
				this.previousMouseX = options.e.pageX;
				this.previousMouseY = options.e.pageY;
				if (handle) {
					this.scalingCropper = handle;
				} else if (move) {
					this.draggingCropper = true;
				}
			}
		},

		_handleMouseMove: function (options) {

			if (this.draggingCropper || this.scalingCropper) {
				if (this.draggingCropper) {
					this._handleCropperDrag(options);
				} else {
					this._handleCropperScale(options);
				}

				this.previousMouseX = options.e.pageX;
				this.previousMouseY = options.e.pageY;
				this._redrawCropperBoundaries();
				this.croppingCanvas.renderAll();
			} else {
				this._setMouseCursor(options.e);
			}
		},

		_handleMouseUp: function (options) {
			this.draggingCropper = false;
			this.scalingCropper = false;
		},

		_handleCropperDrag: function (options) {
			var deltaX = options.e.pageX - this.previousMouseX;
			var deltaY = options.e.pageY - this.previousMouseY;
			var vertices = this._getRectangleVertices(this.clipper, deltaX, deltaY);

			if (!this.arePointsInsideRectangle(vertices, this.tiltedImageVerticeCoords)) {
				return;
			}

			this.clipper.set({
				left: this.clipper.left + deltaX,
				top: this.clipper.top + deltaY
			});
			this._redrawCropperBoundaries();
		},

		_handleCropperScale: function (options) {
			var deltaX = options.e.pageX - this.previousMouseX;
			var deltaY = options.e.pageY - this.previousMouseY;

			// Lock the aspect ratio
			if (this.lockAspectRatio &&
				(this.scalingCropper == 'tl' || this.scalingCropper == 'tr' ||
				this.scalingCropper == 'bl' || this.scalingCropper == 'br')
			) {
				if (Math.abs(deltaX) > Math.abs(deltaY)) {
					var ratio = this.clipper.width / this.clipper.height;
					deltaY = deltaX / ratio;
					deltaY *= (this.scalingCropper == 'tr' || this.scalingCropper == 'bl') ? -1 : 1;
				} else {
					var ratio = this.clipper.width / this.clipper.height;
					deltaX = deltaY * ratio;
					deltaX *= (this.scalingCropper == 'tr' || this.scalingCropper == 'bl') ? -1 : 1;
				}
			}

			var rectangle = {
				left: this.clipper.left,
				top: this.clipper.top,
				width: this.clipper.width,
				height: this.clipper.height
			};

			switch (this.scalingCropper) {
				case 't':
					rectangle.top += deltaY;
					rectangle.height -= deltaY;
					break;
				case 'b':
					rectangle.height += deltaY;
					break;
				case 'l':
					rectangle.left += deltaX;
					rectangle.width -= deltaX;
					break;
				case 'r':
					rectangle.width += deltaX;
					break;
				case 'tl':
					rectangle.top += deltaY;
					rectangle.height -= deltaY;
					rectangle.left += deltaX;
					rectangle.width -= deltaX;
					break;
				case 'tr':
					rectangle.top += deltaY;
					rectangle.height -= deltaY;
					rectangle.width += deltaX;
					break;
				case 'bl':
					rectangle.height += deltaY;
					rectangle.left += deltaX;
					rectangle.width -= deltaX;
					break;
				case 'br':
					rectangle.height += deltaY;
					rectangle.width += deltaX;
					break;
			}

			if (rectangle.height < 20 || rectangle.width < 20) {
				return;
			}

			var vertices = this._getRectangleVertices(rectangle);

			if (!this.arePointsInsideRectangle(vertices, this.tiltedImageVerticeCoords)) {
				return;
			}

			this.clipper.set({
				top: rectangle.top,
				left: rectangle.left,
				width: rectangle.width,
				height: rectangle.height
			});

			this._redrawCropperBoundaries();
			this.croppingCanvas.renderAll();

		},

		_setMouseCursor: function (ev) {
			var cursor = 'default';
			var handle = this._cropperHandleHitTest(ev);

			if (handle) {
				if (handle == 't' || handle == 'b') {
					cursor = 'ns-resize';
				} else if (handle == 'l' || handle == 'r') {
					cursor = 'ew-resize';
				} else if (handle == 'tl' || handle == 'br') {
					cursor = 'nwse-resize';
				} else if (handle == 'bl' || handle == 'tr') {
					cursor = 'nesw-resize';
				}
			} else if (this._cropperHitTest(ev)) {
				cursor = 'move';
			}

			$('.upper-canvas').css('cursor', cursor);
		},

		_cropperHandleHitTest: function (ev) {
			var parentOffset = this.$croppingCanvas.offset();
			var mouseX = ev.pageX - parentOffset.left;
			var mouseY = ev.pageY - parentOffset.top;

			var top = false;
			var left = false;
			var right = false;
			var bottom = false;

			var lb = this.clipper.left;
			var rb = this.clipper.left + this.clipper.width;
			var tb = this.clipper.top;
			var bb = this.clipper.top + this.clipper.height;

			// Left side
			if (mouseX < lb + 10 && mouseX > lb - 3) {
				if (mouseY < tb + 10 && mouseY > tb - 3) {
					return 'tl';
				} else if (mouseY < bb + 3 && mouseY > bb - 10) {
					return 'bl';
				}
			}
			// Right side
			if (mouseX > rb - 13 && mouseX < rb + 3) {
				if (mouseY < tb + 10 && mouseY > tb - 3) {
					return 'tr';
				} else if (mouseY < bb + 2 && mouseY > bb - 10) {
					return 'br';
				}
			}
			if (mouseX < lb + 3 && mouseX > lb - 3 && mouseY < bb - 10 && mouseY > tb + 10) {
				return 'l';
			}
			if (mouseX < rb + 1 && mouseX > rb - 5 && mouseY < bb - 10 && mouseY > tb + 10) {
				return 'r';
			}

			// Top
			if (mouseY < tb + 4 && mouseY > tb - 2 && mouseX > lb + 10 && mouseX < rb - 10) {
				return 't';
			}
			// Bottom
			if (mouseY < bb + 2 && mouseY > bb - 4 && mouseX > lb + 10 && mouseX < rb - 10) {
				return 'b';
			}

			return false;
		},

		_cropperHitTest: function (ev) {
			var parentOffset = this.$croppingCanvas.offset();
			var mouseX = ev.pageX - parentOffset.left;
			var mouseY = ev.pageY - parentOffset.top;

			var lb = this.clipper.left;
			var rb = this.clipper.left + this.clipper.width;
			var tb = this.clipper.top;
			var bb = this.clipper.top + this.clipper.height;

			if (!(mouseX >= lb && mouseX <= rb && mouseY >= tb && mouseY <= bb)) {
				return false;
			}

			return true;
		},

		_getRectangleVertices: function (rectangle, offsetX, offsetY) {
			if (typeof offsetX == typeof undefined) {
				offsetX = 0;
			}
			if (typeof offsetY == typeof undefined) {
				offsetY = 0;
			}

			var topLeft = {x: rectangle.left + offsetX, y: rectangle.top + offsetY};
			var topRight = {x: topLeft.x + rectangle.width, y: topLeft.y};
			var bottomRight = {x: topRight.x, y: topRight.y + rectangle.height};
			var bottomLeft = {x: topLeft.x, y: bottomRight.y};

			return [topLeft, topRight, bottomRight, bottomLeft];
		},

		_setImageVerticeCoordinates: function () {

			var angleInRadians = -1 * this.imageStraightenAngle * (Math.PI / 180);

			// Get the dimensions of the scaled image
			var scaledHeight = this.image.height  * this.getZoomToFitRatio();
			var scaledWidth = this.image.width  * this.getZoomToFitRatio();

			// Calculate the segments of the containing box for the image.
			// When referring to top/bottom or right/left segments, these are on the
			// right-side and bottom projection of the containing box for the zoomed out image.
			var topVerticalSegment = Math.cos(angleInRadians) * scaledHeight;
			var bottomVerticalSegment = Math.sin(angleInRadians) * scaledWidth;
			var rightHorizontalSegment = Math.cos(angleInRadians) * scaledWidth;
			var leftHorizontalSegment = Math.sin(angleInRadians) * scaledHeight;

			// Calculate the offsets from editor box for the image-containing box
			var verticalOffset = (this.editorHeight - (topVerticalSegment + bottomVerticalSegment)) / 2;
			var horizontalOffset = (this.editorWidth - (leftHorizontalSegment + rightHorizontalSegment)) / 2;

			// Finally, calculate the tilted image vertice coordinates
			this.imageVerticeCoords = {
				a: {x: horizontalOffset + rightHorizontalSegment, y: verticalOffset},
				b: {x: this.editorWidth - horizontalOffset, y: verticalOffset + topVerticalSegment},
				c: {x: horizontalOffset + leftHorizontalSegment, y: this.editorHeight - verticalOffset},
				d: {x: horizontalOffset, y: verticalOffset + bottomVerticalSegment}
			};
		},

		_destroyCropper: function () {
			this.clipper = null;
			this.cropperHandles = null;
			this.croppingRectangle = null;
			this.croppingShade = null;
			this.croppingCanvas = null;

			$('#cropping-canvas').siblings('.upper-canvas').remove();
			$('#cropping-canvas').parent('.canvas-container').before($('#cropping-canvas'));
			$('.canvas-container').remove();

		},

		/**
		 * Given an array of points in the form of {x: int, y:int} and a rectangle in the form of
		 * {a:{x:int, y:int}, b:{x:int, y:int}, c:{x:int, y:int}} (the fourth vertice is unnecessary)
		 * return true if the point is in the rectangle.
		 *
		 * Adapted from: http://stackoverflow.com/a/2763387/2040791
		 *
		 * @param point
		 * @param rectangle
		 */
		arePointsInsideRectangle: function (points, rectangle) {

			// Pre-calculate the vectors and scalar products for two rectangle edges
			var ab = this._getVector(rectangle.a, rectangle.b);
			var bc = this._getVector(rectangle.b, rectangle.c);
			var scalarAbAb = this._getScalarProduct(ab, ab);
			var scalarBcBc = this._getScalarProduct(bc, bc);

			for (var i = 0; i < points.length; i++) {
				var point = points[i];

				// Calculate the vectors for two rectangle sides and for
				// the vector from vertices a and b to the point P
				var ap = this._getVector(rectangle.a, point);
				var bp = this._getVector(rectangle.b, point);

				// Calculate scalar or dot products for some vector combinations
				var scalarAbAp = this._getScalarProduct(ab, ap);
				var scalarBcBp = this._getScalarProduct(bc, bp);

				var projectsOnAB = 0 <= scalarAbAp && scalarAbAp <= scalarAbAb;
				var projectsOnBC = 0 <= scalarBcBp && scalarBcBp <= scalarBcBc;

				if (!(projectsOnAB && projectsOnBC)) {
					return false;
				}
			}

			return true;
		},

		/**
		 * Returns an object representing the vector between points a and b.
		 *
		 * @param {{x: number, y: number}} a
		 * @param {{x: number, y: number}} b
		 *
		 * @return {{x: number, y: number}}
		 */
		_getVector: function (a, b) {
			return {x: b.x - a.x, y: b.y - a.y};
		},

		/**
		 * Returns the scalar product of two vectors
		 *
		 * @param {{x: number, y: number}} a
		 * @param {{x: number, y: number}} b
		 *
		 * @return {number}
		 */
		_getScalarProduct: function (a, b) {
			return a.x * b.x + a.y * b.y;
		},

		/**
		 * Returns the magnitude of a vector.
		 *
		 * @param {{x: number, y: number}} vector
		 *
		 * @return {number}
		 */
		_getMagnitude: function (vector) {
			return Math.sqrt(vector.x * vector.x + vector.y * vector.y);
		}
	},
	{
		defaults: {
			gridLineThickness: 1,
			gridLineColor: '#000000',
			gridLinePrecision: 2,
			cropperBorderThickness: 2,
			animationDuration: 100,
			allowSavingAsNew: true,
			minimumCropperSize : {
				width: 30,
				height: 30
			},

			onSave: $.noop,
		}
	}
);