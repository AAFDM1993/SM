import { handleGet, handlePost } from './router.js';

const gasServices = {
  Utilities,
  SpreadsheetApp,
  CacheService,
  PropertiesService,
  ContentService,
  CalendarApp,
};

function doGet(e) {
  return handleGet(e, gasServices);
}

function doPost(e) {
  return handlePost(e, gasServices);
}
