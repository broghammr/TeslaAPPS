Allgemeine Anweisungen:
* Dateien in ./assets niemals löschen

Projekt 01: Tesla Browser Hub:

* Eigene Website die über den Browser im Tesla Model 3 Highland aufgerufen werden kann

Anforderungen:

UI Design:
* gute Ablesbarkeit während der Fahrt: hell, großer Kontrast und große Schriftarten, nur grautöne mit genau einer Akzentfarbe (Blau #0070f3)
* Themen werden in Form von Kacheln dargestellt
* Keine Titelleiste/ Kopfzeile oder ähnliches, nur Überschrift und dann die Kacheln für die Themen
* Kacheln haben ein Icon, eine Überschrift und eine Unterüberschrift, sowie eine Statuszeile
* Die Icons der Kacheln sind Piktogramme
* Die sechste und letzte Kachel zeigt vollflächig assets/chibi.jps

Inhalt:
* Main Hub (index.html): Übersicht der Themen im "Kachel-Design"
* Themen: Hello World (hw), FC Bayern München, Tesla, SpaceX, Light (lt)

Themenseite "Hello World" (hw)
* Inhalt: Unsere Roadtrips werden angezeigt
* Gleiches Kachellayout wie "Main Hub"
* Pro Roadtrip eine Kachel mit je einem vollflächigen Bild
* Ort und Zeitraum des Roadtrips in der Fußzeile
* Die Fußzeile wird halbtransparent über das vollflächigen Bild innerhalb der Kachel gelegt
* Für jeden Roadtrip gibt es im Ordner ./assets ein Bild mit dem Präfix "hw", danach folgt das Datum im Format YYYYMM, danach folgt die Veranstaltung und der Ort
* Beispiel 01: Der Text der Fußzeile für die Datei hw_202605_FSD_Amsterdam.jpg soll dann so erscheinen: "Mai 2026 - FSD, Amsterdam"
* Beispiel 02: Der Text der Fußzeile für die Datei hw_202603_Herr+Schröder_Saarbrücken.jpg soll dann so erscheinen: "März 2026 - Herr Schröder, Saarbrücken"

Themenseite "Light" (lt)
* Inhalt: Steuerung der Beleuchtung im Auto
* Gleiches Kachellayout wie "Main Hub"
* Je eine Kachel für den Sternenhimmel, die Rücksitzbank und den Beifahrer, Details siehe Projekt 02 (Raspberry Pi)
* Vierte Kachel "Farbe": Farbkreis zur Auswahl + Helligkeitsregler; gewählte Farbe (RGB + Helligkeit) wird später über die erweiterte Web-API gesendet
* API lokal:  #Invoke-WebRequest -Uri "http://localhost:8080/gpio/set" -Method POST -Body "pin=17&state=0" -ContentType "application/x-www-form-urlencoded"
* API public: #Invoke-WebRequest -Uri "https://placate-impale-nautical.ngrok-free.dev/gpio/set" -Method POST -Body "pin=17&state=0" -ContentType "application/x-www-form-urlencoded"

Deployment:
* Deployment über GitHub Pages
* Repo: https://github.com/broghammr/TeslaAPPS (öffentlich)
* Ziel-URL: https://broghammr.github.io/TeslaAPPS/
* Workflow: `.github/workflows/pages.yml` (Push auf `main`)
* Einmalig nötig: Repo → Settings → Pages → Source = **GitHub Actions**

Projekt 02: Raspberry Pi:

* Steuerung der Beleuchtung im Tesla Model 3 Highland mit einem Raspberry Pi

Geräte
* Lampe an GPIO 17: Sternenhimmel (On/Off Lampe)
* WLED Streifen an GPIO 21: Rücksitzbank (Farblampe)
* WLED Streifen an GPIO 22: Beifahrer (Farblampe)

Deployment
* Skripte für den Raspberry Pi in Unterordner Raspi speichern

Raspberry Pi "Jacky"
* Steuerung der Geräte
* ngrok Tunnel: Public URL auf lokale URL umleiten (https://placate-impale-nautical.ngrok-free.dev/ -> http://localhost:8080/)
* ngrok config add-authtoken <NGROK_AUTHTOKEN aus lokaler Umgebung / ngrok Dashboard>
* ngrok http 8080 --url https://placate-impale-nautical.ngrok-free.dev
* Steuerung über ein Python Skript (Daemon):
  - Implementierung einer HomeKit Bridge mit den Geräten "Sternenhimmel" als On/Off-Lampe, WLED Streifen "Rücksitzbank" als Farblampe und WLED Streifen "Beifahrer" als Farblampe
  - Implementierung eines Web API Endpoint ebenfalls zur Steuerung der Geräte
  - Den Status der Geräte synchron halten, wenn per Web API gesteuert wurde








