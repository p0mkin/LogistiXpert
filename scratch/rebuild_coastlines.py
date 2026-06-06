"""
Rebuilds GameMap.gd's geographic data arrays so the map renders correctly
across the full expanded bounds (Europe → Middle East).
"""

file_path = 'client/scenes/game_map/GameMap.gd'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# ── 1. Restore sane map bounds (Europe + Turkey + Gulf) ───────────────────────
content = content.replace(
    'var map_min_lat: float = 20.0\nvar map_max_lat: float = 68.0\nvar map_min_lon: float = -6.0\nvar map_max_lon: float = 72.0',
    'var map_min_lat: float = 20.0\nvar map_max_lat: float = 65.0\nvar map_min_lon: float = -8.0\nvar map_max_lon: float = 72.0'
)

# ── 2. Rewrite coastlines array ───────────────────────────────────────────────
new_coastlines = '''\
# Format: Array of points (Vector2(lat, lon))
var coastlines: Array = [
\t# === NORTH SEA / ENGLISH CHANNEL / ATLANTIC ===
\t[
\t\tVector2(51.9, 4.1),    # Rotterdam
\t\tVector2(51.45, 3.5),   # Zeeland
\t\tVector2(51.1, 2.5),    # Belgian coast
\t\tVector2(50.9, 1.8),    # Dunkirk
\t\tVector2(50.95, 1.6),   # Calais
\t\tVector2(51.1, 1.3),    # Cap Gris-Nez
\t\tVector2(51.3, 1.0),    # Margate
\t\tVector2(51.5, 0.5),    # Thames Estuary
\t\tVector2(51.5, 0.1),    # London (Thames)
\t\tVector2(51.3, -0.2),   # South London suburbs
\t\tVector2(50.85, -0.15), # Brighton
\t\tVector2(50.7, -1.1),   # Portsmouth
\t\tVector2(50.6, -2.5),   # Dorset
\t\tVector2(50.35, -3.5),  # Devon
\t\tVector2(50.1, -5.5),   # Cornwall tip
\t\tVector2(51.0, -5.2),   # North Devon
\t\tVector2(51.7, -5.0),   # Pembrokeshire
\t\tVector2(52.8, -4.7),   # Barmouth
\t\tVector2(53.3, -4.6),   # Anglesey
\t\tVector2(53.7, -3.0),   # Blackpool
\t\tVector2(54.0, -2.0),   # Lancaster
\t\tVector2(54.6, -1.4),   # Hartlepool
\t\tVector2(55.0, -1.6),   # Newcastle
\t\tVector2(55.9, -2.1),   # Berwick
\t\tVector2(56.4, -2.4),   # Dundee
\t\tVector2(57.7, -2.5),   # Aberdeen
\t\tVector2(58.6, -3.2),   # Caithness
\t],
\t# === NETHERLANDS / BELGIUM / FRANCE ATLANTIC ===
\t[
\t\tVector2(53.5, 7.2),    # North Sea German-Dutch border
\t\tVector2(53.2, 6.5),    # Groningen coast
\t\tVector2(52.9, 5.7),    # Friesland
\t\tVector2(52.7, 5.1),    # Ijsselmeer
\t\tVector2(52.5, 4.6),    # North Holland
\t\tVector2(52.1, 4.3),    # The Hague
\t\tVector2(51.9, 4.1),    # Rotterdam
\t\tVector2(51.1, 2.5),    # Belgian coast
\t\tVector2(50.9, 1.8),    # Dunkirk
\t\tVector2(50.5, 1.5),    # Cap de la Heve
\t\tVector2(49.5, -0.2),   # Normandy
\t\tVector2(48.7, -1.8),   # Brittany
\t\tVector2(48.0, -4.5),   # Brest tip
\t\tVector2(47.3, -2.5),   # Loire Atlantique
\t\tVector2(46.2, -1.5),   # Charente-Maritime
\t\tVector2(45.5, -1.2),   # Gironde
\t\tVector2(44.3, -1.4),   # Basque-Landes
\t\tVector2(43.4, -1.8),   # Pays Basque
\t],
\t# === IBERIAN (simplified) ===
\t[
\t\tVector2(43.4, -1.8),   # Pays Basque / Spain border
\t\tVector2(43.6, -2.5),   # Asturias
\t\tVector2(43.7, -7.5),   # Galicia
\t\tVector2(42.0, -8.8),   # Vigo
\t\tVector2(38.8, -9.5),   # Lisbon
\t\tVector2(37.0, -8.9),   # Algarve
\t\tVector2(36.0, -5.4),   # Gibraltar
\t\tVector2(36.5, -2.0),   # Almeria
\t\tVector2(37.5, 0.2),    # Alicante
\t\tVector2(39.5, 3.3),    # Balearics / Valencia
\t\tVector2(41.4, 2.2),    # Barcelona
\t\tVector2(42.4, 3.2),    # Costa Brava
\t\tVector2(43.4, 4.0),    # Gulf du Lion
\t\tVector2(43.2, 5.3),    # Marseille
\t],
\t# === MEDITERRANEAN FRANCE / ITALY WEST ===
\t[
\t\tVector2(43.2, 5.3),    # Marseille
\t\tVector2(43.5, 6.8),    # Nice
\t\tVector2(43.75, 7.4),   # Monaco
\t\tVector2(44.1, 8.1),    # Genoa
\t\tVector2(43.8, 9.8),    # Cinque Terre
\t\tVector2(43.5, 10.3),   # Livorno
\t\tVector2(42.6, 10.9),   # Tuscany
\t\tVector2(41.8, 12.3),   # Tiber mouth / Rome
\t\tVector2(41.0, 13.4),   # Gaeta
\t\tVector2(40.0, 15.0),   # Gulf of Policastro
\t\tVector2(38.0, 15.5),   # Calabria tip / Strait of Messina
\t\tVector2(37.5, 15.1),   # Sicily NE
\t\tVector2(37.5, 12.5),   # Sicily south
\t\tVector2(37.9, 13.3),   # Sicily west / Palermo
\t],
\t# === ITALY ADRIATIC ===
\t[
\t\tVector2(38.0, 15.5),   # Calabria
\t\tVector2(39.8, 15.8),   # Basilicata
\t\tVector2(41.3, 15.9),   # Foggia
\t\tVector2(41.9, 15.5),   # Gargano Promontory
\t\tVector2(43.5, 13.5),   # Ancona
\t\tVector2(44.4, 12.2),   # Rimini
\t\tVector2(45.5, 13.0),   # Trieste
\t\tVector2(45.3, 13.6),   # Istrian coast
\t],
\t# === CROATIA / BALKANS ADRIATIC ===
\t[
\t\tVector2(45.3, 13.6),   # Istrian coast
\t\tVector2(44.2, 14.5),   # Zadar
\t\tVector2(43.5, 16.5),   # Split
\t\tVector2(42.7, 17.5),   # Dubrovnik
\t\tVector2(42.3, 18.5),   # Montenegro
\t\tVector2(41.3, 19.5),   # Albania
\t\tVector2(40.6, 19.7),   # Vlore
\t\tVector2(39.6, 20.0),   # Ionian coast
\t],
\t# === GREECE / AEGEAN ===
\t[
\t\tVector2(39.6, 20.0),   # Ionian
\t\tVector2(38.9, 20.8),   # Lefkada
\t\tVector2(37.7, 21.0),   # Peloponnese W
\t\tVector2(36.9, 21.7),   # Cape Matapan
\t\tVector2(37.1, 22.5),   # Laconia
\t\tVector2(37.6, 23.0),   # Argolis
\t\tVector2(37.9, 23.7),   # Athens / Piraeus
\t\tVector2(38.4, 24.0),   # Evia S
\t\tVector2(39.1, 23.0),   # Thessaly coast
\t\tVector2(39.5, 22.8),   # Volos
\t\tVector2(40.0, 22.5),   # Pieria
\t\tVector2(40.5, 22.8),   # Thessaloniki
\t\tVector2(40.9, 24.8),   # Kavala
\t\tVector2(41.3, 26.3),   # Alexandroupolis / Turkish border
\t],
\t# === BLACK SEA (EUROPEAN COAST) ===
\t[
\t\tVector2(41.3, 26.3),   # Alexandroupolis
\t\tVector2(41.0, 27.0),   # Thrace
\t\tVector2(41.1, 28.0),   # Istanbul Bosphorus W
\t\tVector2(41.0, 29.1),   # Istanbul Bosphorus E
\t\tVector2(41.2, 30.5),   # Sakarya
\t\tVector2(41.6, 32.0),   # Sinop coast
\t\tVector2(41.3, 33.5),   # Kastamonu coast
\t\tVector2(41.0, 36.0),   # Samsun
\t\tVector2(41.1, 38.5),   # Trabzon
\t\tVector2(41.5, 41.5),   # Rize
\t],
\t# === BLACK SEA (UKRAINE/RUSSIA NORTH COAST) ===
\t[
\t\tVector2(46.5, 30.7),   # Odessa
\t\tVector2(46.2, 31.8),   # Ochakiv
\t\tVector2(46.3, 33.0),   # Kherson
\t\tVector2(45.8, 33.5),   # Crimea NW
\t\tVector2(44.5, 33.5),   # Sevastopol
\t\tVector2(44.9, 34.8),   # Yalta
\t\tVector2(44.9, 36.5),   # Kerch Strait W
\t\tVector2(45.3, 36.8),   # Kerch Strait
\t\tVector2(46.0, 37.5),   # Azov coast
\t],
\t# === ROMANIA / MOLDOVA (Danube mouth) ===
\t[
\t\tVector2(45.2, 29.8),   # Danube delta N
\t\tVector2(44.9, 29.6),   # Danube delta S
\t\tVector2(44.2, 28.7),   # Constanta
\t\tVector2(43.8, 28.5),   # Bulgaria Black Sea
\t\tVector2(43.2, 28.0),   # Varna
\t\tVector2(42.5, 27.5),   # Burgas
\t\tVector2(41.9, 27.8),   # Turkey border / Tekirdag
\t\tVector2(41.3, 26.3),   # Alexandroupolis
\t],
\t# === SCANDINAVIA (Norway/Sweden west coast) ===
\t[
\t\tVector2(57.7, 8.0),    # Stavanger area
\t\tVector2(58.5, 5.7),    # Stavanger fjord
\t\tVector2(59.1, 5.3),    # Rogaland
\t\tVector2(60.3, 5.1),    # Bergen
\t\tVector2(61.0, 4.7),    # Sognefjord
\t\tVector2(62.5, 6.0),    # Alesund
\t\tVector2(63.5, 8.0),    # Trondheim fjord
\t\tVector2(65.0, 14.0),   # Bodo area
\t],
\t# === SCANDINAVIA (Sweden / Denmark east) ===
\t[
\t\tVector2(56.0, 10.6),   # Jutland E
\t\tVector2(56.5, 10.3),   # Jutland N
\t\tVector2(57.7, 9.5),    # Skagen
\t\tVector2(58.5, 9.5),    # Norway south
\t\tVector2(59.3, 10.6),   # Oslo fjord
\t\tVector2(59.0, 11.0),   # Swedish border
\t\tVector2(58.5, 11.1),   # Gothenburg N
\t\tVector2(57.7, 12.0),   # Gothenburg
\t\tVector2(56.2, 12.5),   # Helsingborg
\t\tVector2(55.6, 13.0),   # Malmoe
\t\tVector2(55.4, 14.5),   # Bornholm strait
\t\tVector2(55.1, 15.1),   # S. Sweden
\t\tVector2(56.5, 16.5),   # Kalmar
\t\tVector2(57.5, 18.3),   # Gotland W
\t\tVector2(58.5, 17.5),   # Nykoping
\t\tVector2(59.3, 18.1),   # Stockholm
\t\tVector2(60.3, 18.5),   # Uppsala coast
\t\tVector2(60.5, 17.7),   # Gavle
\t],
\t# === BALTIC SEA: FINLAND & GULF OF FINLAND ===
\t[
\t\tVector2(59.45, 27.559),
\t\tVector2(59.48, 27.0),
\t\tVector2(59.55, 26.5),
\t\tVector2(59.6, 25.8),
\t\tVector2(59.52, 25.3),
\t\tVector2(59.46, 24.75),  # Tallinn near here
\t\tVector2(59.35, 24.1),
\t\tVector2(59.20, 23.4),
\t\tVector2(59.45, 22.8),  # Turu/Turku
\t\tVector2(60.1, 22.0),
\t\tVector2(60.2, 21.0),
\t\tVector2(60.8, 21.3),
\t\tVector2(61.1, 21.4),   # Pori
\t\tVector2(61.4, 21.5),   # Rauma
\t\tVector2(61.9, 21.3),
\t\tVector2(62.5, 21.5),
\t\tVector2(63.3, 21.5),
\t\tVector2(63.7, 22.8),
\t\tVector2(64.0, 24.5),   # Oulu
\t\tVector2(65.0, 25.0),
\t],
\t# === LATVIA COAST ===
\t[
\t\tVector2(58.38, 24.4),  # Pärnu
\t\tVector2(57.8, 24.3),   # Ainaži
\t\tVector2(57.2, 24.4),   # Saulkrasti
\t\tVector2(57.0, 24.1),   # Riga
\t\tVector2(57.0, 23.5),   # Jurmala
\t\tVector2(57.75, 22.6),  # Cape Kolka
\t\tVector2(57.4, 21.5),   # Ventspils
\t\tVector2(56.5, 21.0),   # Liepaja
\t\tVector2(55.7, 21.1),   # Klaipeda area
\t],
\t# === POLAND COAST / GDANSK ===
\t[
\t\tVector2(55.7, 21.1),   # Klaipeda
\t\tVector2(55.2, 21.0),   # Kaliningrad border W
\t\tVector2(54.7, 19.9),   # Kaliningrad coast
\t\tVector2(54.4, 19.6),   # Braniewo area
\t\tVector2(54.35, 18.65), # Gdansk
\t\tVector2(54.5, 18.0),   # Gdynia
\t\tVector2(54.7, 17.5),   # Leba
\t\tVector2(54.6, 16.0),   # Slupsk
\t\tVector2(54.3, 14.5),   # Kolobrzeg
\t\tVector2(53.9, 14.2),   # Szczecin mouth
\t\tVector2(54.2, 13.9),   # Rugen
\t\tVector2(54.5, 13.5),   # Rugen
\t\tVector2(54.35, 12.0),  # Rostock
\t\tVector2(54.0, 10.9),   # Lubeck Bay
\t\tVector2(54.5, 10.2),   # Kiel
\t\tVector2(55.0, 9.9),    # Flensburg
\t\tVector2(56.0, 10.2),   # Jutland E
\t],
\t# === TURKEY (AEGEAN + SOUTH) ===
\t[
\t\tVector2(41.5, 26.3),   # Turkey NW border
\t\tVector2(40.9, 26.5),   # Edirne coast
\t\tVector2(40.4, 26.7),   # Dardanelles N
\t\tVector2(40.1, 27.0),   # Dardanelles exit
\t\tVector2(39.5, 26.6),   # Izmir N coast
\t\tVector2(38.4, 26.7),   # Izmir
\t\tVector2(37.5, 27.3),   # Bodrum
\t\tVector2(36.5, 28.0),   # Marmaris
\t\tVector2(36.2, 29.6),   # Kas
\t\tVector2(36.2, 31.2),   # Alanya
\t\tVector2(36.5, 32.8),   # Silifke
\t\tVector2(36.8, 35.0),   # Iskenderun
\t\tVector2(36.6, 36.2),   # Turkish-Syrian border
\t],
\t# === MEDITERRANEAN EAST (Syria / Lebanon / Israel) ===
\t[
\t\tVector2(36.6, 36.2),   # Turkish-Syrian border
\t\tVector2(35.5, 35.8),   # Latakia
\t\tVector2(34.5, 35.9),   # Tripoli Lebanon
\t\tVector2(33.9, 35.5),   # Beirut
\t\tVector2(33.0, 35.1),   # Haifa
\t\tVector2(31.9, 34.7),   # Tel Aviv
\t\tVector2(31.2, 34.3),   # Gaza
\t\tVector2(31.0, 32.5),   # Port Said
\t\tVector2(30.5, 32.3),   # Suez Canal entrance
\t],
\t# === RED SEA ENTRANCE / ARABIAN GULF (simplified) ===
\t[
\t\tVector2(27.0, 49.5),   # Saudi Gulf Coast
\t\tVector2(26.0, 50.6),   # Bahrain area
\t\tVector2(25.3, 51.5),   # Qatar
\t\tVector2(25.2, 55.3),   # Dubai / Abu Dhabi
\t\tVector2(24.0, 57.0),   # Oman border
\t],
]'''

# Find and replace the coastlines array in the file
import re

# Find start of coastlines
coast_start = content.find('# Format: Array of points (Vector2(lat, lon))\nvar coastlines: Array = [')
if coast_start == -1:
    coast_start = content.find('var coastlines: Array = [')

if coast_start == -1:
    print("ERROR: Could not find coastlines array start!")
    exit(1)

# Find end of coastlines (the matching closing bracket + newline before 'var borders')
# We need to find the end of the coastlines array
# It ends with ']' followed by borders or ready func
after_coast = content[coast_start:]

# Count brackets to find the end
depth = 0
end_idx = 0
in_array = False
for i, ch in enumerate(after_coast):
    if ch == '[':
        depth += 1
        in_array = True
    elif ch == ']':
        depth -= 1
        if in_array and depth == 0:
            end_idx = i + 1
            break

if end_idx == 0:
    print("ERROR: Could not find end of coastlines array!")
    exit(1)

old_coast = content[coast_start:coast_start + end_idx]
content = content.replace(old_coast, new_coastlines, 1)
print(f"Coastlines replaced successfully ({len(old_coast)} chars -> {len(new_coastlines)} chars)")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("GameMap.gd written successfully.")
