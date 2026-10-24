# TeslaAPPS

Statischer Themen-Hub für den Tesla-Browser: [broghammr.github.io/TeslaAPPS](https://broghammr.github.io/TeslaAPPS/).

## Inhalte

- **Hello World:** Roadtrip-Galerie mit Bildern aus `assets/`.
- **Light:** Steuerung von Beleuchtung, Lüfter und Lichtszenen sowie Startanimation.
- **Monitor:** Raspberry-Pi-Temperatur, beim Laden und bei Auswahl der Kachel aktualisiert.
- **Chibi:** Bildkachel im Hub, die zur Galerie unter `topics/labor.html` führt; auf der Light-Seite löst sie die Startanimation aus.
- **Kryptoportfolio:** Darstellung der fest im Frontend eingetragenen Bestände mit den letzten zwölf abgeschlossenen Monatskursen der Binance-API.

Die Weboberfläche liegt in HTML, CSS und JavaScript direkt im Repository; ein Build-Schritt ist nicht erforderlich. Die Raspberry-Pi-Bridge und Szenenlogik befinden sich in `raspi/`.

## Deployment

Der Workflow `.github/workflows/pages.yml` veröffentlicht den Inhalt des Repositorys auf GitHub Pages. Er läuft bei Pushes auf `main` oder manuell über GitHub Actions. Die Pages-Quelle muss in den Repository-Einstellungen auf **GitHub Actions** gesetzt sein.
