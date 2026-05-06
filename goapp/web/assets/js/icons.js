const SVG_NS = "http://www.w3.org/2000/svg";

const paths = {
  play: [
    ["polygon", { points: "6 3 20 12 6 21 6 3" }],
  ],
  pause: [
    ["rect", { x: "14", y: "4", width: "4", height: "16", rx: "1" }],
    ["rect", { x: "6", y: "4", width: "4", height: "16", rx: "1" }],
  ],
  "skip-back": [
    ["polygon", { points: "19 20 9 12 19 4 19 20" }],
    ["line", { x1: "5", y1: "19", x2: "5", y2: "5" }],
  ],
  "skip-forward": [
    ["polygon", { points: "5 4 15 12 5 20 5 4" }],
    ["line", { x1: "19", y1: "5", x2: "19", y2: "19" }],
  ],
  youtube: [
    ["path", { d: "M2.5 17a24.1 24.1 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.6 49.6 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.1 24.1 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.6 49.6 0 0 1-16.2 0A2 2 0 0 1 2.5 17" }],
    ["path", { d: "m10 15 5-3-5-3z" }],
  ],
};

export function icon(name, options = {}) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("width", String(options.size || 20));
  svg.setAttribute("height", String(options.size || 20));
  svg.setAttribute("focusable", "false");
  svg.classList.add("icon");
  if (options.class) svg.classList.add(...options.class.split(" ").filter(Boolean));

  if (options.title) {
    svg.setAttribute("role", "img");
    const title = document.createElementNS(SVG_NS, "title");
    title.textContent = options.title;
    svg.append(title);
  } else {
    svg.setAttribute("aria-hidden", "true");
  }

  for (const [tag, attrs] of paths[name] || []) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    svg.append(node);
  }

  return svg;
}
