export function getTextNodeExportLayout({
  text,
  nodeWidth,
  nodeHeight,
  fontSize,
  lineHeight,
  letterSpacing,
  padding,
  measureText,
}: {
  text: string;
  nodeWidth: number;
  nodeHeight: number;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  padding: number;
  measureText: (value: string) => number;
}) {
  const lines = text.split("\n");
  const lineWidths = lines.map(line => {
    if (!line) return 0;
    if (letterSpacing === 0) return measureText(line);
    return (
      Array.from(line).reduce((width, character) => width + measureText(character), 0) +
      letterSpacing * fontSize * line.length
    );
  });
  const maxLineWidth = Math.max(0, ...lineWidths);
  const measuredWidth = Math.ceil(maxLineWidth + padding * 2);
  const measuredHeight = Math.ceil(lines.length * fontSize * lineHeight + padding * 2);

  return {
    lines,
    maxLineWidth,
    canvasW: Math.max(nodeWidth + padding * 2, measuredWidth),
    canvasH: Math.max(nodeHeight + padding * 2, measuredHeight),
  };
}
