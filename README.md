# GRIDBOT CONSOLE

GRIDBOT CONSOLE ist eine lokale Weboberfläche für die schrittweise Entwicklung einer Grid-Bot-Mechanik. Das Projekt verbindet ein klares Bedienlayout mit getrennten Funktionsbausteinen für Chartdaten, Guthabenabfrage, Grid-Erstellung und Orderüberwachung.

Die Oberfläche ist bewusst als Arbeitskonsole aufgebaut: Bot-Parameter, Börse, Asset, Quote, Guthaben, Chart, Grid-Menü, Orderplan und Debug-Ansicht bleiben an einem Ort sichtbar und können Schritt für Schritt erweitert werden.

## Vorschau

### Overlay

![GRIDBOT CONSOLE Overlay](Bilder/bild_1_Overlay.PNG)

### Overlay mit geöffnetem Grid-Menü

![GRIDBOT CONSOLE mit geöffnetem Grid-Menü](Bilder/bild_2_Grid_Menu.PNG)

## Funktionen

- Lokale Weboberfläche mit Vite und React
- Lokaler API-Server für gespeicherte Bot-Daten und Phemex-Abfragen
- Globale Speicherung der Bot-Parameter in `data/store.json`
- API-Key und Secret werden lokal in `.env` gespeichert
- `.env` ist ausdrücklich von Git ausgeschlossen
- Chartanzeige mit auswählbaren Intervallen
- Grid-Erstellung als eigener Baustein
- Orderüberwachung als eigener Baustein
- Schutz gegen Doppelorders
- Mindestabstand-Regel für Orderplatzierung
- Start-Asset-Option für vorhandenes Asset-Guthaben
- Deutsch-/Englisch-Umschaltung der Oberfläche

## Projektstruktur

```text
.
├── Bilder/
│   ├── bild_1_Overlay.PNG
│   └── bild_2_Grid_Menu.PNG
├── Grid-Bot-Bausteine/
├── data/
│   └── store.json
├── scripts/
│   └── dev.mjs
├── server/
│   ├── phemexCreateGrid.mjs
│   └── phemexMonitor.mjs
├── src/
│   ├── App.tsx
│   ├── App.css
│   └── MarketChart.tsx
├── server.mjs
├── start-gridbot-menu.bat
└── README.md
```

## Start

Abhängigkeiten installieren:

```bash
npm install
```

Entwicklungsserver starten:

```bash
npm run dev
```

Danach ist die Oberfläche lokal erreichbar:

```text
http://127.0.0.1:5173
```

Die API läuft lokal auf:

```text
http://127.0.0.1:5174
```

Alternativ kann das Projekt unter Windows über die BAT-Datei gestartet werden:

```text
start-gridbot-menu.bat
```

## Build

```bash
npm run build
```

## Secrets

API-Key und Secret gehören nicht ins Repository.

Die Datei `.env` bleibt lokal und wird durch `.gitignore` ausgeschlossen:

```text
.env
.env.local
```

Beispiel:

```text
PHEMEX_API_KEY=
PHEMEX_API_SECRET=
PHEMEX_PASSPHRASE=
```

## Entwicklungsprinzip

Die Grid-Bot-Mechanik wird nicht als großer Block aufgebaut, sondern in getrennten Bausteinen. Jeder Baustein soll einzeln verständlich, testbar und austauschbar bleiben.

Wichtige Bausteine:

- Bot-Start und Initialisierung
- Datenabfrage für Preis und Guthaben
- Grid-Level-Berechnung
- Grid-Erstellung
- Orderprüfung
- Buy-Abholung und Sperre
- Sell-Folgeorder
- Sell-Abholung und Freigabe
- Doppelorder-Blockierung
- Testplan

