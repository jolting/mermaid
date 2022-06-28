import { select } from 'd3';
import dagre from 'dagre';
import graphlib from 'graphlib';
import { log } from '../../logger';
import classDb, { lookUpDomId } from './classDb';
import { parser } from './parser/classDiagram';
import svgDraw from './svgDraw';
import { configureSvgSize } from '../../utils';
import { getConfig } from '../../config';
import addSVGAccessibilityFields from '../../accessibility';

parser.yy = classDb;

let idCache = {};
const padding = 20;

const conf = {
  dividerMargin: 10,
  padding: 5,
  textHeight: 10,
};

/**
 * Gets the ID with the same label as in the cache
 *
 * @param {string} label The label to look for
 * @returns {string} The resulting ID
 */
const getGraphId = function (label) {
  const foundEntry = Object.entries(idCache).find((entry) => entry[1].label === label);

  if (foundEntry) {
    return foundEntry[0];
  }
};

/**
 * Setup arrow head and define the marker. The result is appended to the svg.
 *
 * @param {SVGSVGElement} elem The SVG element to append to
 */
const insertMarkers = function (elem) {
  elem
    .append('defs')
    .append('marker')
    .attr('id', 'extensionStart')
    .attr('class', 'extension')
    .attr('refX', 0)
    .attr('refY', 7)
    .attr('markerWidth', 190)
    .attr('markerHeight', 240)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M 1,7 L18,13 V 1 Z');

  elem
    .append('defs')
    .append('marker')
    .attr('id', 'extensionEnd')
    .attr('refX', 19)
    .attr('refY', 7)
    .attr('markerWidth', 20)
    .attr('markerHeight', 28)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M 1,1 V 13 L18,7 Z'); // this is actual shape for arrowhead

  elem
    .append('defs')
    .append('marker')
    .attr('id', 'compositionStart')
    .attr('class', 'extension')
    .attr('refX', 0)
    .attr('refY', 7)
    .attr('markerWidth', 190)
    .attr('markerHeight', 240)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M 18,7 L9,13 L1,7 L9,1 Z');

  elem
    .append('defs')
    .append('marker')
    .attr('id', 'compositionEnd')
    .attr('refX', 19)
    .attr('refY', 7)
    .attr('markerWidth', 20)
    .attr('markerHeight', 28)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M 18,7 L9,13 L1,7 L9,1 Z');

  elem
    .append('defs')
    .append('marker')
    .attr('id', 'aggregationStart')
    .attr('class', 'extension')
    .attr('refX', 0)
    .attr('refY', 7)
    .attr('markerWidth', 190)
    .attr('markerHeight', 240)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M 18,7 L9,13 L1,7 L9,1 Z');

  elem
    .append('defs')
    .append('marker')
    .attr('id', 'aggregationEnd')
    .attr('refX', 19)
    .attr('refY', 7)
    .attr('markerWidth', 20)
    .attr('markerHeight', 28)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M 18,7 L9,13 L1,7 L9,1 Z');

  elem
    .append('defs')
    .append('marker')
    .attr('id', 'dependencyStart')
    .attr('class', 'extension')
    .attr('refX', 0)
    .attr('refY', 7)
    .attr('markerWidth', 190)
    .attr('markerHeight', 240)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M 5,7 L9,13 L1,7 L9,1 Z');

  elem
    .append('defs')
    .append('marker')
    .attr('id', 'dependencyEnd')
    .attr('refX', 19)
    .attr('refY', 7)
    .attr('markerWidth', 20)
    .attr('markerHeight', 28)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M 18,7 L9,13 L14,7 L9,1 Z');
};

/**
 * Merges the value of `conf` with the passed `cnf`
 *
 * @param {object} cnf Config to merge
 */
export const setConf = function (cnf) {
  const keys = Object.keys(cnf);

  keys.forEach(function (key) {
    conf[key] = cnf[key];
  });
};

/**
 * Draws a flowchart in the tag with id: id based on the graph definition in text.
 *
 * @param {string} text
 * @param {string} id
 */
export const draw = function (text, id) {
  idCache = {};
  parser.yy.clear();
  parser.parse(text);

  log.info('Rendering diagram ' + text);

  const securityLevel = getConfig().securityLevel;
  // Handle root and ocument for when rendering in sanbox mode
  let sandboxElement;
  if (securityLevel === 'sandbox') {
    sandboxElement = select('#i' + id);
  }
  const root =
    securityLevel === 'sandbox'
      ? select(sandboxElement.nodes()[0].contentDocument.body)
      : select('body');
  const doc = securityLevel === 'sandbox' ? sandboxElement.nodes()[0].contentDocument : document;

  // Fetch the default direction, use TD if none was found
  const diagram = root.select(`[id='${id}']`);
  insertMarkers(diagram);

  // Layout graph, Create a new directed graph
  const g = new graphlib.Graph({
    multigraph: true,
  });

  // Set an object for the graph label
  g.setGraph({
    isMultiGraph: true,
  });

  // Default to assigning a new object as a label for each new edge.
  g.setDefaultEdgeLabel(function () {
    return {};
  });

  const classes = classDb.getClasses();
  const keys = Object.keys(classes);

  for (let i = 0; i < keys.length; i++) {
    const classDef = classes[keys[i]];
    const node = svgDraw.drawClass(diagram, classDef, conf);
    idCache[node.id] = node;

    // Add nodes to the graph. The first argument is the node id. The second is
    // metadata about the node. In this case we're going to add labels to each of
    // our nodes.
    g.setNode(node.id, node);

    log.info('Org height: ' + node.height);
  }

  const relations = classDb.getRelations();
  relations.forEach(function (relation) {
    log.info(
      'tjoho' + getGraphId(relation.id1) + getGraphId(relation.id2) + JSON.stringify(relation)
    );
    g.setEdge(
      getGraphId(relation.id1),
      getGraphId(relation.id2),
      {
        relation: relation,
      },
      relation.title || 'DEFAULT'
    );
  });

  dagre.layout(g);
  g.nodes().forEach(function (v) {
    if (typeof v !== 'undefined' && typeof g.node(v) !== 'undefined') {
      log.debug('Node ' + v + ': ' + JSON.stringify(g.node(v)));
      root
        .select('#' + lookUpDomId(v))
        .attr(
          'transform',
          'translate(' +
            (g.node(v).x - g.node(v).width / 2) +
            ',' +
            (g.node(v).y - g.node(v).height / 2) +
            ' )'
        );
    }
  });

  g.edges().forEach(function (e) {
    if (typeof e !== 'undefined' && typeof g.edge(e) !== 'undefined') {
      log.debug('Edge ' + e.v + ' -> ' + e.w + ': ' + JSON.stringify(g.edge(e)));
      svgDraw.drawEdge(diagram, g.edge(e), g.edge(e).relation, conf);
    }
  });

  const svgBounds = diagram.node().getBBox();
  const width = svgBounds.width + padding * 2;
  const height = svgBounds.height + padding * 2;

  configureSvgSize(diagram, height, width, conf.useMaxWidth);

  // Ensure the viewBox includes the whole svgBounds area with extra space for padding
  const vBox = `${svgBounds.x - padding} ${svgBounds.y - padding} ${width} ${height}`;
  log.debug(`viewBox ${vBox}`);
  diagram.attr('viewBox', vBox);
  addSVGAccessibilityFields(parser.yy, diagram, id);
};

export default {
  setConf,
  draw,
};
