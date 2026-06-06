const fs = require('fs');
const path = require('path');

let citiesTsPath = path.join(__dirname, '..', 'server', 'src', 'domain', 'cities.ts');
let citiesTs = fs.readFileSync(citiesTsPath, 'utf8');

const prefix = 'export const CITIES_DATASET: Record<string, City> = ';
const startIdx = citiesTs.indexOf(prefix);
if (startIdx === -1) throw new Error("Could not find dataset in cities.ts");

let datasetStr = citiesTs.substring(startIdx + prefix.length);
datasetStr = datasetStr.trim().replace(/;$/, '');
const finalJsData = 'const CITIES_DATASET = ' + datasetStr + ';';

let scriptJsPath = path.join(__dirname, '..', 'web', 'script.js');
let scriptJs = fs.readFileSync(scriptJsPath, 'utf8');
scriptJs = scriptJs.replace(/const CITIES_DATASET = \{[\s\S]*?\n\};/, finalJsData);
fs.writeFileSync(scriptJsPath, scriptJs);

let sharedJsPath = path.join(__dirname, '..', 'web', 'shared.js');
let sharedJs = fs.readFileSync(sharedJsPath, 'utf8');
sharedJs = sharedJs.replace(/const CITIES_DATASET = \{[\s\S]*?\n\};/, finalJsData);
fs.writeFileSync(sharedJsPath, sharedJs);

console.log("Successfully synced from cities.ts to web JS!");
