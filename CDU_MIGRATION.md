# Migracija u CDU (Centar dijeljenih usluga)

Ovaj dokument opisuje plan migracije aplikacije **DII IT Ulaganja** s
Firebase-a na **CDU Podatkovnu platformu** — državni oblak Republike
Hrvatske.

> **Status:** priprema (faza 0). Aplikacija i dalje koristi Firebase.
> Nikakva migracija podataka nije izvršena.

---

## 1. Što CDU nudi (sažetak iz CDU dokumentacije)

| Sloj | Tehnologija | Pristup |
|---|---|---|
| Strukturirani podaci | GreenPlum (Tanzu, MPP, PostgreSQL 9.4) | JDBC / ODBC / libpq |
| Nestrukturirani (hot) | Pure FlashBlade S3 | S3 protokol |
| Nestrukturirani (cold) | Dell ECS S3 | S3 protokol |
| Ingestion datoteka | Apache NiFi | HTTPS / FTPS push |
| ETL/ELT | Talend Data Fabric | Talend Studio + REST API |
| Katalog metapodataka | Talend Data Catalog | REST API (port 11480) |
| Streaming | Apache Kafka (2025) | Kafka client (TCP) |
| Obrada | Apache Spark (2025) | Spark API |
| Vizualizacija | Tableau Server | embed / link |
| IaaS | VM hosting | tu se može deployati backend |

## 2. Ciljana arhitektura

```
React (frontend, GitHub Pages ili CDU IaaS)
    │
    ▼  HTTPS
Naš Node.js backend (na CDU IaaS VM-u)
    │
    ├──▶  CDU GreenPlum (PostgreSQL kompatibilan)   — primarni podaci
    ├──▶  CDU S3 Hot / Cold                          — uploadane datoteke (Excel, PDF)
    ├──▶  CDU NiFi                                   — automatski uvoz iz vanjskih izvora
    └──▶  Talend Data Catalog                        — registracija metapodataka
```

### Zašto backend?

Browser ne može direktno komunicirati s GreenPlum/PostgreSQL bazom
(TCP/SSL protokol, nema browser SDK). Firebase je iznimka jer ima
namjenski browser SDK i deklarativne security rules. **Migracija na
CDU nužno povlači uvođenje backend sloja.**

## 3. Plan po fazama

### Faza 0 — Priprema (TRENUTNO)
- [x] `DataProvider` apstrakcija (`src/providers/DataProvider.ts`)
- [x] `firebaseProvider` adapter (omotava postojeći `firestoreService`)
- [x] `cduRestProvider` stub (sve metode bacaju `NotImplementedError`)
- [x] Settings → tab "Backend (CDU)" za buduću konfiguraciju
- [x] Ovaj dokument

**Rezultat:** Aplikacija radi identično kao prije. Apstrakcija postoji,
ali je još nitko ne koristi. Sigurno za merge.

### Faza 1 — Migracija call-sitea na provider
- [ ] Postupno zamijeniti pozive `firestoreService.*` s `getProvider().*`
- [ ] Po jedna stranica/komponenta u zasebnom PR-u
- [ ] Firebase ostaje aktivan i potpuno funkcionalan

### Faza 2 — Backend prototype
- [ ] Inicijalizacija Node.js (Fastify ili Express) projekta
- [ ] Schema GreenPlum baze (DDL) — mapiranje Firestore kolekcija na SQL tablice
- [ ] REST endpointi koji repliciraju `DataProvider` ugovor
- [ ] Implementacija `cduRestProvider` da govori s backendom
- [ ] Lokalni `docker-compose` s PostgreSQL-om za razvoj

### Faza 3 — CDU IaaS deploy
- [ ] Zahtjev za VM na CDU IaaS-u
- [ ] Deploy backend-a, CI/CD pipeline (GitLab — CDU koristi GitLab)
- [ ] Konekcija na CDU GPDB iz backenda
- [ ] S3 integracija (file uploads na CDU S3 Hot/Cold)

### Faza 4 — Migracija podataka
- [ ] Export Firestore kolekcija → JSON
- [ ] Import skripta za GPDB
- [ ] Paralelni rad (dual-write) na ograničeni period
- [ ] Verifikacija pariteta podataka
- [ ] Switchover (Settings → Backend → CDU)

### Faza 5 — Autentifikacija
- [ ] Zamjena Firebase Auth-a s lokalnim JWT-om (ili)
- [ ] Integracija s NIAS (Nacionalnim identifikacijskim i autentifikacijskim sustavom)

### Faza 6 — Dodatne integracije
- [ ] Talend Data Catalog — registracija schema metapodataka
- [ ] NiFi pipeline (ako se uvodi automatski uvoz iz vanjskih izvora)
- [ ] Tableau dashboards (ako se prelazi s ugrađenih grafova na Tableau)

## 4. Što se NE mijenja

- Postojeća React aplikacija ostaje, samo se zamjenjuje sloj komunikacije s bazom
- UI/UX, modeli podataka, business logika — sve ostaje
- Excel uvoz, batch upravljanje, izvještaji — funkcionalnosti se ne mijenjaju

## 5. Rizici i mitigacije

| Rizik | Mitigacija |
|---|---|
| Real-time updates (Firestore subscriptions) nemaju ekvivalent u SQL-u | Polling ili Server-Sent Events kroz backend |
| Performanse SQL upita nad velikim tablicama | GPDB je MPP — paralelizacija je njegova snaga |
| Učenje novog stack-a (Node, SQL, Docker, CI/CD) | Faza 2 daje vremena za prototip prije produkcije |
| CDU dostupnost / SLA | Backup u Firebase dok god se ne dokaže stabilnost |

## 6. Reference

- CDU dokumentacija: `https://wiki.cdu.gov.hr/hr/usluge/DataLake/oPPplatformi`
- Interni dokument: `Standard razvoja javnih e-usluga u RH`
- Firestore servis u kodu: `src/services/firestoreService.ts`
- Provider apstrakcija: `src/providers/`
