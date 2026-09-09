export function salesQuery(filter) {
  if (!filter) return "";
  if (filter.last) return `?last=${filter.last}`;
  return `?start=${filter.start}&end=${filter.end}`;
}

// Export the successfully consulted period, never the dates being edited.
export function salesPdfPath(report) {
  return `/sales/export.pdf?start=${report.start}&end=${report.end}`;
}

export function hasCorrections(report) {
  return report.correctedCount > 0;
}
