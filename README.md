# DII IT Ulaganja – MVP web aplikacija

## 1. Svrha projekta

Ovaj projekt je olakšana MVP web aplikacija za:

- učitavanje Excel datoteka (`.xlsx`, po potrebi i `.xls`)
- parsiranje i validaciju podataka iz jednog standardiziranog obrasca
- spremanje originalne datoteke
- spremanje obrađenih podataka u Google Firebase
- pregled uvezenih batch-eva, grešaka i podataka kroz web sučelje

Aplikacija se u početnoj fazi hosta na **GitHub Pages**, a poseban backend server se **ne koristi**. Cijeli srednji sloj mora biti implementiran **unutar same web aplikacije** kao klijentska logika u pregledniku.

---

## 2. Preporučeni tehnološki stack

### Obavezno

- **TypeScript**
- **React**
- **Vite**
- **Firebase Web SDK**
- **Cloud Firestore**
- **Firebase Authentication**
- **Firebase Cloud Storage**
- **SheetJS / xlsx** za parsiranje Excel datoteka u browseru

### Zašto ovaj stack

Ovaj stack je najprikladniji jer:

- GitHub Pages hosta statične web aplikacije
- Firebase ima vrlo dobru podršku za web aplikacije
- TypeScript omogućuje strogo modeliranje Excel polja, validacija i Firebase dokumenata
- React + Vite daju brz razvoj, jednostavan build i lagan deploy
- obrada Excel tablice može se napraviti direktno u pregledniku bez zasebnog servera

---

## 3. Arhitektura aplikacije

Aplikacija je potpuno web-klijentska i sastoji se od tri logička sloja:

### 3.1. UI sloj

Web sučelje za:

- login
- upload Excel datoteke
- unos i spremanje Firebase konfiguracije
- prikaz batch statusa
- prikaz grešaka validacije
- pregled uvezenih podataka
- osnovni dashboard

### 3.2. Klijentski service sloj

Ovo je zamjena za klasični backend u MVP-u. Mora raditi:

- čitanje datoteke iz browsera
- parsiranje Excel listova
- validaciju i normalizaciju podataka
- mapiranje u Firebase model
- spremanje batch metapodataka
- spremanje grešaka i upozorenja
- spremanje originalne datoteke u Cloud Storage
- upis obrađenih podataka u Firestore

### 3.3. Firebase sloj

- **Authentication** za prijavu korisnika
- **Cloud Firestore** za podatke aplikacije
- **Cloud Storage** za originalne uploadane Excel datoteke

---

## 4. Ograničenja MVP varijante

Ovaj MVP **nema pravi backend**. To znači:

- nema server-side tajni
- nema servisnog računa u frontend kodu
- nema privatnog admin API-ja na GitHub Pages
- sva zaštita mora se temeljiti na **Firebase Authentication** i **Firebase Security Rules**

Ova verzija je zamišljena kao **proof of concept / pilot** za isprobavanje funkcionalnosti.

Za produkciju se kasnije može dodati:

- Firebase Cloud Functions
- zaseban backend servis
- migracija ili sinkronizacija prema relacijskoj bazi

---

## 5. Funkcionalni opseg MVP-a

### 5.1. Autentikacija

Aplikacija mora imati:

- login ekran
- email/password prijavu preko Firebase Auth
- logout
- osnovnu provjeru je li korisnik prijavljen

### 5.2. Konfiguracija Firebase konekcije u aplikaciji

Aplikacija mora imati ekran **Postavke / Firebase konfiguracija** s ovim poljima:

- `apiKey`
- `authDomain`
- `projectId`
- `storageBucket`
- `messagingSenderId`
- `appId`

Aplikacija mora:

- validirati da su sva obavezna polja unesena
- ponuditi gumb **Poveži**
- inicijalizirati Firebase SDK nakon uspješnog unosa konfiguracije
- spremiti konfiguraciju lokalno u preglednik za razvojni rad
- imati opciju **Reset connection**

Napomena:

- u MVP-u je dopušteno spremanje konfiguracije u `localStorage`
- za ozbiljniji deploy kasnije koristiti `.env` varijable ili centralizirano upravljanje konfiguracijom

### 5.3. Upload Excel datoteke

Korisnik mora moći:

- odabrati Excel datoteku
- pokrenuti import
- vidjeti status obrade
- vidjeti rezultat importa

Pri uploadu se radi:

1. spremanje originalne datoteke u Cloud Storage
2. parsiranje Excel datoteke u browseru
3. validacija podataka
4. upis batch zapisa u Firestore
5. upis normaliziranih podataka u Firestore
6. upis grešaka i upozorenja u Firestore

### 5.4. Validacija i obrada

Aplikacija mora implementirati pravila:

- razlikovati `0` od praznog polja
- podržati `NP`, `NE`, `-` i slične oznake
- sačuvati napomenu kad postoji
- provjeriti obavezna polja
- provjeriti očekivane listove
- provjeriti očekivana zaglavlja
- generirati upozorenja i greške po polju, listu i redu

Validacija mora biti modularna i odvojena od UI-ja.

### 5.5. Pregled podataka

Aplikacija mora imati:

- listu import batch-eva
- detalje jednog importa
- listu grešaka i upozorenja
- pregled uvezenih financijskih stavki
- pregled instaliranih resursa
- osnovne filtre po godini, kategoriji i instituciji

### 5.6. Dashboard

Minimalni dashboard treba prikazivati:

- broj import batch-eva
- broj grešaka
- broj upozorenja
- broj institucija
- osnovne ukupne iznose po kategorijama
- agregaciju po godinama 2024–2028

---

## 6. Predloženi Firebase model podataka

Napomena: Firestore je dokumentna baza, pa se ovdje koristi dokumentni model umjesto relacijskih tablica.

### Kolekcije

#### `users`

- `email`
- `displayName`
- `role`
- `createdAt`
- `active`

#### `institutions`

- `name`
- `oib`
- `contactName`
- `contactEmail`
- `notes`
- `createdAt`
- `updatedAt`

#### `importBatches`

- `fileName`
- `fileHash`
- `uploadedBy`
- `uploadedAt`
- `processingStatus`
- `warningCount`
- `errorCount`
- `storagePath`
- `institutionId`
- `templateVersion`
- `importSummary`

#### `importIssues`

- `batchId`
- `severity` (`error` / `warning`)
- `sheetName`
- `rowLabel`
- `fieldName`
- `message`
- `originalValue`
- `createdAt`

#### `financialEntries`

- `batchId`
- `institutionId`
- `categoryGroup` (`CAPEX`, `ODRZAVANJE`, `LICENCE`, `OPEX`, `CLOUD`)
- `categoryName`
- `year`
- `valueType` (`planirano`, `realizirano`, `ostalo` po potrebi)
- `amount`
- `note`
- `sourceSheet`
- `sourceRowKey`
- `rawValue`
- `normalizedValue`
- `createdAt`

#### `installedResources`

- `batchId`
- `institutionId`
- `resourceGroup`
- `resourceName`
- `quantity`
- `unit`
- `note`
- `sourceSheet`
- `sourceRowKey`
- `createdAt`

#### `auditLogs`

- `userId`
- `action`
- `entityType`
- `entityId`
- `timestamp`
- `details`

---

## 7. Pravila za import

Aplikacija mora imati idempotentan import:

- isti dokument ne smije biti ponovno učitan bez jasne korisničke odluke
- preporučeno je izračunati `fileHash` i provjeriti postoji li već batch s istim hashom

Preporučeni redoslijed obrade:

1. korisnik odabere datoteku
2. aplikacija izračuna hash
3. aplikacija provjeri postoji li isti hash
4. datoteka se sprema u Storage
5. Excel se parsira
6. radi se validacija
7. spremaju se `importBatch`, `importIssues`, `financialEntries`, `installedResources` i `auditLogs`

---

## 8. Sigurnosni zahtjevi

MVP mora koristiti:

- Firebase Authentication
- Firestore Security Rules
- Storage Security Rules

Minimalna pravila:

- samo prijavljeni korisnici smiju čitati i pisati
- samo admin može brisati ili ručno mijenjati batch zapise
- korisnik smije uploadati samo u predviđenu putanju
- produkcijski se ne smije koristiti potpuno otvoreni pristup nad bazom i storageom

---

## 9. Predložena struktura projekta

```text
src/
  app/
  pages/
    LoginPage.tsx
    SettingsPage.tsx
    UploadPage.tsx
    ImportsPage.tsx
    ImportDetailPage.tsx
    DashboardPage.tsx
  components/
  services/
    firebaseService.ts
    authService.ts
    storageService.ts
    firestoreService.ts
    importService.ts
  excel/
    parseWorkbook.ts
    sheetMappers.ts
    validators.ts
    normalizers.ts
  models/
    firebase.ts
    import.ts
    financial.ts
  utils/
  hooks/
  config/
```

---

## 10. Tehničke smjernice za razvoj

- koristiti **TypeScript strict mode**
- logiku obrade Excela držati izvan React komponenti
- UI komponente ne smiju direktno sadržavati Firebase logiku
- Firebase inicijalizaciju držati u jednom centralnom servisu
- validacije moraju biti odvojene po listovima
- svaka obrada mora vraćati strukturirani rezultat:
  - `success`
  - `warnings`
  - `errors`
  - `normalizedData`

---

## 11. Početni razvojni koraci

### Korak 1

Postaviti Vite + React + TypeScript projekt.

### Korak 2

Dodati Firebase Web SDK i ekran za Firebase konfiguraciju.

### Korak 3

U Firebase konzoli:

- kreirati projekt
- registrirati web app
- uključiti Email/Password auth
- uključiti Cloud Firestore
- uključiti Cloud Storage

### Korak 4

Napraviti osnovni login ekran.

### Korak 5

Napraviti upload ekran i spremanje originalne Excel datoteke u Storage.

### Korak 6

Napraviti parsiranje Excela u browseru.

### Korak 7

Napraviti validaciju i mapiranje.

### Korak 8

Spremiti batch, issue i normalizirane podatke u Firestore.

### Korak 9

Napraviti listu batch-eva i dashboard.

---

## 12. NPM paketi

Preporučeni početni paketi:

```bash
npm install firebase react-router-dom xlsx zod
npm install -D typescript vite @types/node
```

Po potrebi dodati:

- UI biblioteku (`mantine`, `mui`, `chakra-ui` ili slično)
- `date-fns`
- `zustand` ili drugi state manager ako projekt naraste

---

## 13. Deploy na GitHub Pages

Projekt mora biti spreman za GitHub Pages deployment preko GitHub Actions.

Potrebno je:

- postaviti ispravan `base` u `vite.config.ts`
- uključiti GitHub Pages u repo postavkama
- koristiti GitHub Actions workflow za build i deploy

Ako je repo project site, `base` treba biti postavljen na:

```ts
base: '/IME_REPOZITORIJA/'
```

---

## 14. Što nije cilj ove faze

U ovoj fazi se ne radi:

- pravi backend server
- Firebase Cloud Functions
- kompleksne role i napredna autorizacija
- višestruki obrasci
- napredni BI izvještaji
- relacijska baza
- produkcijsko hardening podešavanje

---

## 15. Važna arhitekturna napomena

Ovo je **MVP / proof-of-concept arhitektura** za brzo testiranje:

- hostanje: GitHub Pages
- obrada: u browseru
- baza: Firebase
- datoteke: Firebase Storage

Kasnije, ako projekt preraste MVP, preporučeni smjer je:

- zadržati frontend
- premjestiti import logiku u Cloud Functions ili zaseban backend
- po potrebi migrirati ili sinkronizirati podatke u relacijsku bazu radi naprednijeg izvještavanja

---

## 16. Preporuka za Codex

Ako se ovaj README koristi kao početna specifikacija za Codex ili drugog AI asistenta za razvoj, prioriteti razvoja trebaju biti:

1. postavljanje projekta i Firebase povezivanja
2. login i upravljanje sesijom
3. upload Excel datoteke
4. parsiranje jednog standardiziranog obrasca
5. validacija i spremanje u Firestore
6. pregled batch-eva i grešaka
7. osnovni dashboard

Ne treba odmah razvijati napredne funkcije ako osnovni import i prikaz još nisu stabilni.
