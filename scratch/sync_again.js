const fs = require('fs');
const path = require('path');

let scriptJsPath = path.join(__dirname, '..', 'web', 'script.js');
let scriptJs = fs.readFileSync(scriptJsPath, 'utf8');

const match = scriptJs.match(/const CITIES_DATASET = \{[\s\S]*?\n\};/);
if (!match) throw new Error("Could not find dataset in script.js");
const datasetStr = match[0];

let sharedJsPath = path.join(__dirname, '..', 'web', 'shared.js');
let sharedJs = fs.readFileSync(sharedJsPath, 'utf8');
sharedJs = sharedJs.replace(/const CITIES_DATASET = \{[\s\S]*?\n\};/, datasetStr);
fs.writeFileSync(sharedJsPath, sharedJs);

let citiesTsPath = path.join(__dirname, '..', 'server', 'src', 'domain', 'cities.ts');
let citiesTs = fs.readFileSync(citiesTsPath, 'utf8');
citiesTs = citiesTs.replace(/export const CITIES_DATASET: Record<string, City> = \{[\s\S]*?\n\};/, datasetStr.replace('const CITIES_DATASET = {', 'export const CITIES_DATASET: Record<string, City> = {'));
fs.writeFileSync(citiesTsPath, citiesTs);

console.log("Done");
