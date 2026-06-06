import { CITIES_DATASET } from '../server/src/domain/cities';
import fs from 'fs';

const finalJson = { cities: CITIES_DATASET };
fs.writeFileSync('client/resources/cities.json', JSON.stringify(finalJson, null, 2));
console.log('Successfully synced cities.json! Total cities:', Object.keys(CITIES_DATASET).length);
