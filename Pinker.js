/*
* Pinker: A standalone JavaScript library for rendering code dependency diagrams on your web page.
* Github: https://github.com/WithoutHaste/Pinker
*/

var pinker = pinker || {};

pinker.version = '1.0.0';

pinker.config = {
	fontSize: 14 //font size in pixels
	,fontFamily: "Georgia"
	,scopeMargin: 30 //minimum space around each scope
	,scopePadding: 10 //minimum space between scope boundary and scope contents
	,canvasPadding: 15 //minimum space between canvas boundary and scopes
	,backgroundColor: "#FFFFFF" //white
	,shadeColor: "#EEEEEE" //pale gray
	,lineColor: "#000000" //black
	,lineDashLength: 5 //length of a dash in pixels
	,lineDashSpacing: 3 //length of space between dashes in pixels
	,font: function() {
		return this.fontSize + "px " + this.fontFamily;
	}
	,estimateFontHeight: function() {
		return this.fontSize;
	}
};

(function() { //private scope
	
	pinker.draw = function(canvasElement, sourceText) {
		const source = parseSource(sourceText);
		if(source.hasErrors)
		{
			source.errorMessages.forEach(function(errorMessage) {
				console.log(`Pinker Error on canvas '${canvasElement.id}': ${errorMessage}`);
			});
			return;
		}
		//console.log(source);
		updateCanvas(canvasElement, source);
	};
	
	//returns a "source" object
	function parseSource(sourceText) {
		const source = createEmptySource();
		sourceText = removeIndentation(sourceText);
		const sections = parseSections(sourceText);
		source.addSections(sections);
		source.validate();
		return source;
	}
	
	//breaks text into sections, keeping all section headers
	//returns an array of "section" objects
	function parseSections(sourceText) {
		const lines = sourceText.split("\n");
		let sections = [];
		let inSection = false;
		let currentSection = null;
		//find all sections
		for(let i=0; i<lines.length; i++)
		{
			let line = lines[i];
			if(line.length == 0)
				continue;
			if(line.match(/^.+\:$/) == null) //not a normal or reference header
			{
				if(inSection)
				{
					currentSection.body.push(line);
				}
			}
			else
			{
				const header = line.match(/^(.+)\:$/)[1]
				currentSection = createSection(header);
				sections.push(currentSection);
				inSection = true;
			}
		}
		//collapse reference sections
		let collapsedSections = [];
		let inReferenceSection = false;
		let currentReferenceSection = null;
		sections.forEach(function(section) {
			if(section.header.match(/^\[.+\]$/) == null) //not a reference header
			{
				if(inReferenceSection)
					currentReferenceSection.sections.push(section);
				else
					collapsedSections.push(section);
			}
			else
			{
				const header = section.header.match(/^\[(.+)\]$/)[1];
				currentReferenceSection = createReferenceSection(header);
				collapsedSections.push(currentReferenceSection);
				inReferenceSection = true;
			}
		});		
		
		return collapsedSections;
	}
	
	//returns the text, with all leading whitespace characters removed
	function removeIndentation(text) {
		return text.replace(/^\s+/mg,"");
	}
	
	function createEmptySource(label=null) {
		return {
			label: label, //Level 1 has no label
			hasErrors: false,
			errorMessages: [],
			layout: null,
			relations: null,
			nestedSources: [],
			validate: function() {
				if(this.layout == null)
				{
					this.hasErrors = true;
					this.errorMessages.push("No layout section.");
				}
				let self = this;
				this.nestedSources.forEach(function(nestedSource) {
					nestedSource.validate();
					if(nestedSource.hasErrors)
					{
						self.hasErrors = true;
						nestedSource.errorMessages.forEach(function(errorMessage) {
							self.errorMessages.push(`${errorMessage} Section: '${nestedSource.label}'.`);
						});
					}
				});
			},
			addSections: function(sections) {
				let self = this;
				sections.forEach(function(section) {
					if(section.isReferenceSection)
						self.addNestedSource(section.reference, section.sections);
					else
						self.addSection(section);
				});
			},
			addSection: function(section) {
				switch(section.header)
				{
					case "layout":
					case "Layout": 
						if(this.layout != null)
							return;
						this.layout = parseLayoutSection(section); 
						break;
					case "relations":
					case "Relations": 
						if(this.relations != null)
							return;
						this.relations = parseRelationsSection(section); 
						break;
				}
			},
			addNestedSource: function(label, sections) {
				if(label.length == 0)
					return; //invalid label
				for(let i=0; i < this.nestedSources.length; i++)
				{
					let nestedSource = this.nestedSources[i];
					if(nestedSource.label == label)
						return; //it belongs here but we already have one, so skip it
					let labelStart = nestedSource.label + ".";
					if(label.startsWith(labelStart))
					{
						let subLabel = label.substring(labelStart.length);
						nestedSource.addNestedSource(subLabel, sections);
						return;
					}
				}
				let nestedSource = createEmptySource(label);
				nestedSource.addSections(sections);
				this.nestedSources.push(nestedSource);
			}
		};
	}
	
	function parseLayoutSection(section) {
		let layoutSection = createLayoutSection();
		section.body.forEach(function(line) {
			if(line.length == 0)
				return;
			layoutSection.rows.push(parseLayoutRow(line));
		});
		return layoutSection;
	}
	
	function parseLayoutRow(line) {
		let layoutRow = createLayoutRow();
		let leftRight = line.split("...");
		let left = leftRight[0].match(/\[(.)+?\]/g);
		left.forEach(function(label) {
			layoutRow.leftAlign.push(dereferenceLabel(label));
		});
		if(leftRight.length > 1)
		{
			let right = leftRight[1].match(/\[(.)+?\]/g);
			right.forEach(function(label) {
				layoutRow.rightAlign.push(dereferenceLabel(label));
			});
		}
		return layoutRow;
	}
	
	function parseRelationsSection(section) {
		let relationsSection = createRelationsSection();
		section.body.forEach(function(line) {
			let match = line.match(/\[(.*?)\](.*?)(\[.*\])/);
			if(match == null)
				return;
			let start = match[1];
			let arrowType = match[2];
			let ends = match[3].match(/\[.*?\]/g);
			ends.forEach(function(end) {
				relationsSection.relations.push(createRelation(start, arrowType, dereferenceLabel(end)));
			});
		});
		return relationsSection;
	}
	
	function createSection(header) {
		return {
			header: header,
			body: [],
			isReferenceSection: false
		};
	}
	
	function createReferenceSection(reference) {
		return {
			reference: reference,
			sections: [],
			isReferenceSection: true
		};
	}
	
	function createLayoutSection() {
		return {
			rows: []
		};
	}
	
	function createLayoutRow() {
		return {
			leftAlign: [], //arrays of strings/labels
			rightAlign: [],
			all: function() {
				return this.leftAlign.concat(this.rightAlign);
			}
		};
	}
	
	function createRelationsSection() {
		return {
			relations: []
		};
	}
	
	function createRelation(startLabel, arrowType, endLabel) {
		return {
			startLabel: startLabel,
			arrowType: arrowType,
			endLabel: endLabel
		};
	}
	
	//remove outer square brackets from text
	function dereferenceLabel(text) {
		return text.match(/^\[(.+)\]$/)[1];
	}
	
	function updateCanvas(canvasElement, source) {
		let context = canvasElement.getContext('2d');
		const nodes = convertLayoutToNodes(source, context);
		const dimensions = calculateCanvasDimensions(nodes);
		canvasElement.setAttribute("width", dimensions.width);
		canvasElement.setAttribute("height", dimensions.height);
		
		//fill background
		context.fillStyle = pinker.config.backgroundColor;
		context.fillRect(0, 0, dimensions.width, dimensions.height);
		
		//layout
		drawNodes(nodes, context);
		
		//relations
		drawRelations(source, nodes, context);
	}
	
	function drawNodes(nodes, context) {
		context.strokeStyle = pinker.config.lineColor;
		context.fillStyle = pinker.config.lineColor;
		nodes.forEach(function(node) {
			context.strokeRect(node.absoluteX, node.absoluteY, node.width, node.height);
			//label
			//TODO save label layout instead of redoing it
			//TODO have one method for centering text in a region, pass in one line or multiple lines
			context.font = pinker.config.font();
			let wordHeight = pinker.config.estimateFontHeight();
			if(node.nodes.length == 0)
			{
				let y = node.absoluteY + pinker.config.scopePadding + wordHeight;
				let words = node.label.split(" ");
				words.forEach(function(word) {
					let textWidth = context.measureText(word).width;
					context.fillText(word, node.absoluteX + ((node.width - textWidth)/2), y);
					y += wordHeight;
				});
			}
			else
			{
				context.fillStyle = pinker.config.shadeColor;
				context.strokeStyle = pinker.config.lineColor;
				context.fillRect(node.absoluteX, node.absoluteY, node.width, node.contentsY);
				context.strokeRect(node.absoluteX, node.absoluteY, node.width, node.contentsY);
				let textWidth = context.measureText(node.label).width;
				context.fillStyle = pinker.config.lineColor;
				context.fillText(node.label, node.absoluteX + ((node.width - textWidth)/2), node.absoluteY + node.contentsY - pinker.config.scopePadding);
			
				drawNodes(node.nodes, context);
			}
		});
	}
	
	function drawRelations(source, allNodes, context, path=null) {
		if(path == null || path.length == 0)
			path = source.label;
		else
			path += "." + source.label;
		if(source.relations != null)
		{
			source.relations.relations.forEach(function(relation) {
				const startNode = findNode(allNodes, relation.startLabel, path);
				const endNode = findNode(allNodes, relation.endLabel, path);
				if(startNode == null || endNode == null)
					return;
				drawArrowBetweenNodes(startNode, endNode, convertArrowType(relation.arrowType), convertLineType(relation.arrowType), context);
			});
		}
		source.nestedSources.forEach(function(nestedSource) {
			drawRelations(nestedSource, allNodes, context, path);
		});
	}
	
	function convertLayoutToNodes(source, context, path=null) {
		if(path == null || path.length == 0)
			path = source.label;
		else
			path += "." + source.label;
		let nodeRows = [];
		let allNodes = [];
		let y = pinker.config.canvasPadding; //top margin
		let maxX = 0;
		//layout as if all are left aligned
		source.layout.rows.forEach(function(row) {
			let nodes = []
			let x = pinker.config.canvasPadding; //left margin
			let rowHeight = 0;
			const leftAlignCount = row.leftAlign.length;
			let index = 0;
			row.all().forEach(function(label) {
				let nestedNodes = [];
				for(let i=0; i<source.nestedSources.length; i++)
				{
					let nestedSource = source.nestedSources[i];
					if(nestedSource.label == label)
					{
						nestedNodes = convertLayoutToNodes(nestedSource, context, path);
						break;
					}
				}
				
				const isRightAlign = (index >= leftAlignCount);
				const nodeDimensions = calculateNodeDimensions(label, nestedNodes, context);
				let node = createNode(x, y, nodeDimensions.width, nodeDimensions.height, label, path, isRightAlign);
				node.nodes = nestedNodes;
				node.contentsX = nodeDimensions.contentsX;
				node.contentsY = nodeDimensions.contentsY;
				nodes.push(node);
				
				x += nodeDimensions.width + pinker.config.scopeMargin;
				rowHeight = Math.max(rowHeight, nodeDimensions.height);
				index++;
			});
			maxX = Math.max(maxX, x - pinker.config.scopeMargin);
			y += rowHeight + pinker.config.scopeMargin;
			nodeRows.push(nodes);
			allNodes = allNodes.concat(nodes);
		});
		//apply right alignment
		nodeRows.forEach(function(nodes) {
			nodes.reverse();
			let x = maxX - pinker.config.scopeMargin;
			nodes.forEach(function(node) {
				if(!node.isRightAlign)
					return;
				node.x = x;
				x -= node.width - pinker.config.scopeMargin;
			});
		});
		//calculate final locations
		allNodes.forEach(function(node) {
			node.setAbsoluteLocations();
		});
		return allNodes;
	}
	
	function findNode(nodes, label, labelPath) {
		let node = findNodeRelative(nodes, label, labelPath);
		if(node != null)
			return node;
		return findNodeAbsolute(nodes, label);
	}
	
	function findNodeRelative(nodes, label, path) {
		let startingNode = findNodeAbsolute(nodes, path);
		if(startingNode == null)
			return null;
		return findNodeAbsolute(startingNode.nodes, label);
	}
	
	function findNodeAbsolute(nodes, label) {
		for(let i=0; i<nodes.length; i++)
		{
			let node = nodes[i];
			let result = node.findLabel(label);
			if(result != null)
				return result;
		}
		return null;
	}
	
	function createNode(x, y, width, height, label=null, path=null, isRightAlign=false) {
		return {
			x: x,
			y: y,
			width: width,
			height: height,
			path: path, //full path from root to parent scope
			label: label, //simple label of node within scope
			contentsX: 0, //starting point of contents, relative to this node
			contentsY: 0,
			nodes: [],
			isRightAlign: isRightAlign,
			pathLabel: function() {
				if(path == null || path.length == 0)
					return label;
				return path + "." + label;
			},
			center: function() {
				return {
					x: this.x + (this.width / 2),
					y: this.y + (this.height / 2)
				};
			},
			absoluteCenter: function() {
				return {
					x: this.absoluteX + (this.width / 2),
					y: this.absoluteY + (this.height / 2)
				};
			},
			setAbsoluteLocations: function(deltaX=0, deltaY=0) {
				this.absoluteX = this.x + deltaX;
				this.absoluteY = this.y + deltaY;
				let self = this;
				this.nodes.forEach(function(nestedNode) {
					nestedNode.setAbsoluteLocations(self.absoluteX + self.contentsX, self.absoluteY + self.contentsY);
				});
			},
			isAbove: function(otherNode) {
				return (this.absoluteY + this.height < otherNode.absoluteY);
			},
			isBelow: function(otherNode) {
				return (this.absoluteY > otherNode.absoluteY + otherNode.height);
			},
			isLeftOf: function(otherNode) {
				return (this.absoluteX + this.width < otherNode.absoluteX);
			},
			isRightOf: function(otherNode) {
				return (this.absoluteX > otherNode.absoluteX + otherNode.width);
			},
			pathPrefix: function() {
				return this.label + ".";
			},
			findLabel: function(label) {
				if(label == null)
					return null;
				if(this.label == label)
					return this;
				if(!label.startsWith(this.pathPrefix()))
					return null;
				label = label.substring(this.pathPrefix().length);
				for(let i=0; i<this.nodes.length;i++)
				{
					let node = this.nodes[i];
					let result = node.findLabel(label);
					if(result != null)
						return result;
				}
				return null;
			}
		};
	}
	
	function calculateCanvasDimensions(nodes) {
		let width = 0;
		let height = 0;
		nodes.forEach(function(node) {
			width = Math.max(width, node.x + node.width);
			height = Math.max(height, node.y + node.height);
		});
		width += pinker.config.canvasPadding; //right margin
		height += pinker.config.canvasPadding; //bottom margin
		return createDimensions(width, height);
	}

	function calculateNodeDimensions(label, nestedNodes, context) {
		if(nestedNodes == null || nestedNodes.length == 0)
			return calculateLabelDimensions(label, context);
		const nestedDimensions = calculateCanvasDimensions(nestedNodes);
		const labelWidth = context.measureText(label).width;
		const labelHeight = pinker.config.estimateFontHeight() + (pinker.config.scopePadding * 2);
		return {
			width: Math.max(labelWidth + (pinker.config.scopePadding * 2), nestedDimensions.width),
			height: nestedDimensions.height + labelHeight,
			contentsX: 0,
			contentsY: labelHeight
		};
	}
	
	function calculateLabelDimensions(label, context) {
		context.font = pinker.config.font();
		let wordHeight = pinker.config.estimateFontHeight();
		let width = 0;
		let height = 0;
		let words = label.split(" ");
		words.forEach(function(word) {
			width = Math.max(width, context.measureText(word).width);
			height += wordHeight;
		});
		width += pinker.config.scopePadding * 2;
		height += pinker.config.scopePadding * 2;
		return {
			width: width,
			height: height,
			contentsX: 0,
			contentsY: 0
		};
	}
	
	function createDimensions(width, height) {
		return {
			width: width,
			height: height
		};
	}
	
	const arrowTypes = {
		plainArrow: 1,
		hollowArrow: 2,
		hollowDiamond: 3,
		filledDiamond: 4
	};
	
	const lineTypes = {
		solid: 1,
		dashed: 2
	};
	
	function convertArrowType(arrowText) {
		if(arrowText.length > 2)
			arrowText = arrowText.substring(arrowText.length-2);
		switch(arrowText)
		{
			case "->": return arrowTypes.plainArrow;
			case ":>": return arrowTypes.hollowArrow;
			case "-o": return arrowTypes.hollowDiamond;
			case "-+": return arrowTypes.filledDiamond;
			default: return arrowTypes.plainArrow;
		}
	}
	
	function convertLineType(arrowText) {
		if(arrowText.length > 2)
			arrowText = arrowText.substring(0, 2);
		switch(arrowText)
		{
			case "--": return lineTypes.dashed;
			case "->": 
			case "-:": 
			case "-o": 
			case "-+": return lineTypes.solid;
			default: return lineTypes.solid;
		}
	}
	
	function drawArrowBetweenNodes(startNode, endNode, arrowType, lineType, context) {
		let start = startNode.absoluteCenter();
		let end = endNode.absoluteCenter();
		if(startNode.isAbove(endNode))
			start.y = startNode.absoluteY + startNode.height;
		else if(startNode.isBelow(endNode))
			start.y = startNode.absoluteY;
		if(startNode.isLeftOf(endNode))
			start.x = startNode.absoluteX + startNode.width;
		else if(startNode.isRightOf(endNode))
			start.x = startNode.absoluteX;
		if(endNode.isAbove(startNode))
			end.y = endNode.absoluteY + endNode.height;
		else if(endNode.isBelow(startNode))
			end.y = endNode.absoluteY;
		if(endNode.isLeftOf(startNode))
			end.x = endNode.absoluteX + endNode.width;
		else if(endNode.isRightOf(startNode))
			end.x = endNode.absoluteX;
		drawArrow(start, end, arrowType, lineType, context);
	}
	
	function drawArrow(start, end, arrowType, lineType, context) {
		var headlen = 10; // length of head in pixels TODO move to config calculation based on scopeMargin
		var angle = Math.atan2(end.y - start.y, end.x - start.x);
		//line
		context.beginPath();
		switch(lineType)
		{
			case lineTypes.solid: context.setLineDash([]); break;
			case lineTypes.dashed: context.setLineDash([pinker.config.lineDashLength, pinker.config.lineDashSpacing]); break;
		}
		context.moveTo(start.x, start.y);
		context.lineTo(end.x, end.y);
		context.stroke();
		//arrow
		context.setLineDash([]); //solid line
		const arrowCornerA = createCoordinates(end.x - headlen * Math.cos(angle - Math.PI/6), end.y - headlen * Math.sin(angle - Math.PI/6));
		const arrowCornerB = createCoordinates(end.x - headlen * Math.cos(angle + Math.PI/6), end.y - headlen * Math.sin(angle + Math.PI/6));
		const diamondCornerC = createCoordinates(arrowCornerA.x - headlen * Math.cos(angle + Math.PI/6), arrowCornerA.y - headlen * Math.sin(angle + Math.PI/6));
		switch(arrowType)
		{
			case arrowTypes.plainArrow:
				context.beginPath();
				context.moveTo(end.x, end.y);
				context.lineTo(arrowCornerA.x, arrowCornerA.y);
				context.moveTo(end.x, end.y);
				context.lineTo(arrowCornerB.x, arrowCornerB.y);
				context.stroke();
				break;
			case arrowTypes.hollowArrow:
				//hollow center covers line
				context.fillStyle = pinker.config.backgroundColor;
				context.beginPath();
				context.moveTo(end.x, end.y);
				context.lineTo(arrowCornerA.x, arrowCornerA.y);
				context.lineTo(arrowCornerB.x, arrowCornerB.y);
				context.lineTo(end.x, end.y);
				context.fill();
				//arrow outline
				context.beginPath();
				context.moveTo(end.x, end.y);
				context.lineTo(arrowCornerA.x, arrowCornerA.y);
				context.lineTo(arrowCornerB.x, arrowCornerB.y);
				context.lineTo(end.x, end.y);
				context.stroke();
				break;
			case arrowTypes.hollowDiamond:
				//hollow center covers line
				context.fillStyle = pinker.config.backgroundColor;
				context.beginPath();
				context.moveTo(end.x, end.y);
				context.lineTo(arrowCornerA.x, arrowCornerA.y);
				context.lineTo(diamondCornerC.x, diamondCornerC.y);
				context.lineTo(arrowCornerB.x, arrowCornerB.y);
				context.lineTo(end.x, end.y);
				context.fill();
				//arrow outline
				context.beginPath();
				context.moveTo(end.x, end.y);
				context.lineTo(arrowCornerA.x, arrowCornerA.y);
				context.lineTo(diamondCornerC.x, diamondCornerC.y);
				context.lineTo(arrowCornerB.x, arrowCornerB.y);
				context.lineTo(end.x, end.y);
				context.stroke();
				break;
			case arrowTypes.filledDiamond:
				//solid center covers line
				context.fillStyle = pinker.config.lineColor;
				context.beginPath();
				context.moveTo(end.x, end.y);
				context.lineTo(arrowCornerA.x, arrowCornerA.y);
				context.lineTo(diamondCornerC.x, diamondCornerC.y);
				context.lineTo(arrowCornerB.x, arrowCornerB.y);
				context.lineTo(end.x, end.y);
				context.fill();
				//arrow outline
				context.beginPath();
				context.moveTo(end.x, end.y);
				context.lineTo(arrowCornerA.x, arrowCornerA.y);
				context.lineTo(diamondCornerC.x, diamondCornerC.y);
				context.lineTo(arrowCornerB.x, arrowCornerB.y);
				context.lineTo(end.x, end.y);
				context.stroke();
				break;
		}
	}	
	
	function createCoordinates(x, y) {
		return {
			x: x,
			y: y
		};
	}

})();