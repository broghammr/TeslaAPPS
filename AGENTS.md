Ziel:

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
* Themen: Hello World (hw), FC Bayern München, Tesla, SpaceX, X Money (xm)

Themenseite "Hello World" (hw)
* Inhalt: Unsere Roadtrips werden angezeigt
* Gleiches Kachellayout wie "Main Hub"
* Pro Roadtrip eine Kachel mit je einem vollflächigen Bild
* Ort und Zeitraum des Roadtrips in der Fußzeile
* Die Fußzeile wird halbtransparent über das vollflächigen Bild innerhalb der Kachel gelegt
* Für jeden Roadtrip gibt es im Ordner ./assets ein Bild mit dem Präfix "hw", danach folgt das Datum im Format YYYYMM, danach folgt die Veranstaltung und der Ort
* Beispiel 01: Der Text der Fußzeile für die Datei hw_202605_FSD_Amsterdam.jpg soll dann so erscheinen: "Mai 2026 - FSD, Amsterdam"
* Beispiel 02: Der Text der Fußzeile für die Datei hw_202603_Herr+Schröder_Saarbrücken.jpg soll dann so erscheinen: "März 2026 - Herr Schröder, Saarbrücken"
* Die letzte Kachel zeigt vollflächig assets/chibi.jps

Themenseite "X Money" (xm)
* Inhalt: Testseite um eine Lampe in meinem Smarthome ein-/ und auszuschalten
* Gleiches Kachelleyout wie "Main Hub"
* Eine einzige Kachel welche eine Lampe mit dem Namen "Bilder" ein- bzw. ausschaltet
* API einschalten: curl -X POST http://esp32-27DAE4.speedport.ip/gpio/set --data "pin=22&state=1"
* API ausschalten: curl -X POST http://esp32-27DAE4.speedport.ip/gpio/set --data "pin=22&state=0"


Deployment:

* Deployment über GitHub Pages
* Repo: https://github.com/broghammr/TeslaAPPS (öffentlich)
* Ziel-URL: https://broghammr.github.io/TeslaAPPS/
* Workflow: `.github/workflows/pages.yml` (Push auf `main`)
* Einmalig nötig: Repo → Settings → Pages → Source = **GitHub Actions**







