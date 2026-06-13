export function json_(data, services) {
  return services.ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    services.ContentService.MimeType.JSON
  );
}
