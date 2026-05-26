/**
 * Referentna lista DII korisnika (150 tijela).
 *
 * Ovo je denominator za statistiku dostave podataka.
 * OIB-ovi su upareni automatski iz registra javnih tijela.
 * Tijela bez OIB-a (oib: null) trebaju ručnu provjeru.
 *
 * NIJE za prikazivanje u UI-u (za to postoji registar-tijela.json).
 * Koristi se isključivo za izračun statistike i praćenje dostave.
 */

export interface DiiEntry {
  name: string
  email: string
  dostava: 'DA' | 'NE' | 'Dopis' | ''
  oib: string | null
}

export const DII_REGISTRY: DiiEntry[] = [
  {
    "name": "Ministarstvo financija (Porezna uprava)",
    "email": "kabinet@mfin.hr",
    "dostava": "DA",
    "oib": "18683136487"
  },
  {
    "name": "Ministarstvo unutarnjih poslova",
    "email": "kabinet@mup.hr",
    "dostava": "DA",
    "oib": "36162371878"
  },
  {
    "name": "Ministarstvo obrane",
    "email": "kabinet@morh.hr",
    "dostava": "DA",
    "oib": "66486182714"
  },
  {
    "name": "Ministarstvo zdravstva",
    "email": "kabinet@miz.hr",
    "dostava": "DA",
    "oib": "88362248492"
  },
  {
    "name": "Ministarstvo znanosti, obrazovanja i mladih",
    "email": "kabinet@mzom.hr",
    "dostava": "DA",
    "oib": "49508397045"
  },
  {
    "name": "Ministarstvo gospodarstva",
    "email": "ministar@mingo.hr",
    "dostava": "DA",
    "oib": "19370100881"
  },
  {
    "name": "Ministarstvo regionalnoga razvoja i fondova Europske unije",
    "email": "kabinet@mrrfeu.hr​",
    "dostava": "DA",
    "oib": "69608914212"
  },
  {
    "name": "Ministarstvo mora, prometa i infrastrukture",
    "email": "ministar@mmpi.hr",
    "dostava": "DA",
    "oib": "22874515170"
  },
  {
    "name": "Ministarstvo rada, mirovinskoga sustava, obitelji i socijalne politike",
    "email": "kabinet@mrosp.hr",
    "dostava": "DA",
    "oib": "53969486500"
  },
  {
    "name": "Ministarstvo poljoprivrede, šumarstva i ribarstva",
    "email": "kabinet@mps.hr",
    "dostava": "NE",
    "oib": "76767369197"
  },
  {
    "name": "Ministarstvo kulture i medija",
    "email": "kabinet@min-kulture.hr",
    "dostava": "DA",
    "oib": "37836302645"
  },
  {
    "name": "Ministarstvo turizma i sporta",
    "email": "kabinet@mints.hr",
    "dostava": "DA",
    "oib": "87892589782"
  },
  {
    "name": "Ministarstvo vanjskih i europskih poslova",
    "email": "kabinet.ministra@mvep.hr",
    "dostava": "NE",
    "oib": "43541122224"
  },
  {
    "name": "Ministarstvo zaštite okoliša i zelene tranzicije",
    "email": "kabinet@mzozt.hr",
    "dostava": "NE",
    "oib": "59951999361"
  },
  {
    "name": "Ministarstvo demografije i useljeništva",
    "email": "kabinet@mdu.hr",
    "dostava": "NE",
    "oib": "43609566625"
  },
  {
    "name": "Ministarstvo prostornoga uređenja, graditeljstva i državne imovine",
    "email": "ministar@mpgi.hr",
    "dostava": "DA",
    "oib": "95093210687"
  },
  {
    "name": "Ministarstvo hrvatskih branitelja",
    "email": "ministar@branitelji.hr",
    "dostava": "DA",
    "oib": "95131524528"
  },
  {
    "name": "Središnji državni ured za središnju javnu nabavu",
    "email": "pisarnica@nabava.gov.hr",
    "dostava": "NE",
    "oib": "17683204722"
  },
  {
    "name": "Središnji državni ured za Hrvate izvan Republike Hrvatske",
    "email": "kabinet@hrvatiizvanrh.hr",
    "dostava": "NE",
    "oib": "03416985458"
  },
  {
    "name": "Hrvatska vatrogasna zajednica",
    "email": "vatrogastvo@hvz.hr",
    "dostava": "DA",
    "oib": "08474627795"
  },
  {
    "name": "Državni zavod za statistiku",
    "email": "ured@dzs.hr",
    "dostava": "DA",
    "oib": "49337502853"
  },
  {
    "name": "Državni zavod za intelektualno vlasništvo",
    "email": "kabinetravnatelja@dziv.hr",
    "dostava": "DA",
    "oib": "89755384389"
  },
  {
    "name": "Državni zavod za mjeriteljstvo",
    "email": "ured.ravnatelja@dzm.hr",
    "dostava": "DA",
    "oib": "99875008081"
  },
  {
    "name": "Državna geodetska uprava",
    "email": "kabinet.glavnog.ravnatelja@dgu.hr",
    "dostava": "DA",
    "oib": "84891127540"
  },
  {
    "name": "Državni hidrometeorološki zavod",
    "email": "kabinet@dhz.hr",
    "dostava": "DA",
    "oib": "74660437164"
  },
  {
    "name": "Državni inspektorat",
    "email": "kabinet.dirh@dirh.hr",
    "dostava": "DA",
    "oib": "33706439962"
  },
  {
    "name": "Hrvatska regulatorna agencija za mrežne djelatnosti (HAKOM)",
    "email": "Ravnatelj@hakom.hr",
    "dostava": "DA",
    "oib": "87950783661"
  },
  {
    "name": "Hrvatska agencija za nadzor financijskih usluga (HANFA)",
    "email": "pisarnica@hanfa.hr spomenka.sambolec@hanfa.hr",
    "dostava": "DA",
    "oib": "49376181407"
  },
  {
    "name": "Agencija za zaštitu osobnih podataka (AZOP)",
    "email": "ravnatelj@azop.hr",
    "dostava": "DA",
    "oib": "28454963989"
  },
  {
    "name": "Središnje klirinško depozitarno društvo (SKDD)",
    "email": "skdd@skdd.hr",
    "dostava": "Dopis",
    "oib": "64406809162"
  },
  {
    "name": "Financijska agencija (FINA)",
    "email": "andreja.kajtaz@fina.hr",
    "dostava": "DA",
    "oib": "85821130368"
  },
  {
    "name": "Agencija za komercijalnu djelatnost (AKD)",
    "email": "jure.sertic@akd.hr",
    "dostava": "NE",
    "oib": "58843087891"
  },
  {
    "name": "Agencija za podršku informacijskim sustavima i informacijskim tehnologijama (APIS IT)",
    "email": "sasa.bilic@apis-it.hr",
    "dostava": "DA",
    "oib": "02994650199"
  },
  {
    "name": "Hrvatska akademska i istraživačka mreža (CARNET)",
    "email": "ivan.sabic@carnet.hr",
    "dostava": "NE",
    "oib": "58101996540"
  },
  {
    "name": "Sveučilišni računski centar (SRCE)",
    "email": "ured@srce.hr",
    "dostava": "DA",
    "oib": "34016189309"
  },
  {
    "name": "Odašiljači i veze d.o.o. (OiV)",
    "email": "uprava@oiv.hr",
    "dostava": "DA",
    "oib": "88150534338"
  },
  {
    "name": "Agencija za plaćanja u poljoprivredi, ribarstvu i ruralnom razvoju (APPRRR)",
    "email": "ravnatelj@apprrr.hr",
    "dostava": "DA",
    "oib": "99122235709"
  },
  {
    "name": "Središnja agencija za financiranje i ugovaranje (SAFU)",
    "email": "ravnatelj@safu.hr",
    "dostava": "DA",
    "oib": "11548277852"
  },
  {
    "name": "Hrvatski zavod za mirovinsko osiguranje (HZMO)",
    "email": "ravnatelj@mirovinsko.hr",
    "dostava": "NE",
    "oib": "84397956623"
  },
  {
    "name": "Hrvatski zavod za zapošljavanje (HZZ)",
    "email": "ravnatelj@hzz.hr",
    "dostava": "DA",
    "oib": "91547293790"
  },
  {
    "name": "Hrvatski zavod za zdravstveno osiguranje (HZZO)",
    "email": "ravnatelj@hzzo.hr",
    "dostava": "NE",
    "oib": "02958272670"
  },
  {
    "name": "Hrvatski zavod za socijalni rad",
    "email": "ravnateljica@hzsr.hr",
    "dostava": "DA",
    "oib": "52966791065"
  },
  {
    "name": "Centar za posebno skrbništvo",
    "email": "tina.eljuga@socskrb.hr",
    "dostava": "NE",
    "oib": "15916354928"
  },
  {
    "name": "Državna škola za javnu upravu",
    "email": "rudolf.vujevic@dsju.hr",
    "dostava": "NE",
    "oib": "01681646554"
  },
  {
    "name": "Hrvatski sabor",
    "email": "predsjednik@sabor.hr",
    "dostava": "NE",
    "oib": "38597506234"
  },
  {
    "name": "Predsjednik Republike Hrvatske",
    "email": "ured@predsjednik.hr",
    "dostava": "NE",
    "oib": "10162055275"
  },
  {
    "name": "Vlada Republike Hrvatske",
    "email": "predsjednik@vlada.hr",
    "dostava": "NE",
    "oib": "64434885131"
  },
  {
    "name": "Ustavni sud Republike Hrvatske",
    "email": "Ustavni_sud@usud.hr",
    "dostava": "DA",
    "oib": "43530726662"
  },
  {
    "name": "Državni ured za reviziju",
    "email": "Nada.Svete@revizija.hr",
    "dostava": "DA",
    "oib": "55448281176"
  },
  {
    "name": "Pučki pravobranitelj",
    "email": "info@ombudsman.hr",
    "dostava": "DA",
    "oib": "08026537914"
  },
  {
    "name": "Povjerenik za informiranje",
    "email": "ppi@pristupinfo.hr",
    "dostava": "DA",
    "oib": "68011638990"
  },
  {
    "name": "Pravobranitelj za djecu",
    "email": "ppi@dijete.hr",
    "dostava": "NE",
    "oib": "71628985886"
  },
  {
    "name": "Pravobranitelj za osobe s invaliditetom",
    "email": "ured@posi.hr",
    "dostava": "NE",
    "oib": "39572892750"
  },
  {
    "name": "Pravobraniteljica za ravnopravnost spolova",
    "email": "ravnopravnost@prs.hr",
    "dostava": "NE",
    "oib": "18164416576"
  },
  {
    "name": "Institut Ruđer Bošković",
    "email": "Ana.Marija.Horvatin@irb.hr",
    "dostava": "NE",
    "oib": "69715301002"
  },
  {
    "name": "Institut za fiziku",
    "email": "ifs@ifs.hr",
    "dostava": "NE",
    "oib": "77627408491"
  },
  {
    "name": "Ekonomski institut Zagreb",
    "email": "eizagreb@eizg.hr",
    "dostava": "DA",
    "oib": "70925432731"
  },
  {
    "name": "Institut za međunarodne odnose",
    "email": "ured@irmo.hr",
    "dostava": "Dopis",
    "oib": "31120185175"
  },
  {
    "name": "Institut za društvena istraživanja u Zagrebu",
    "email": "idiz@idi.hr",
    "dostava": "DA",
    "oib": "11986338639"
  },
  {
    "name": "Hrvatska akademija znanosti i umjetnosti (HAZU)",
    "email": "kabpred@hazu.hr",
    "dostava": "NE",
    "oib": "61989185242"
  },
  {
    "name": "Institut za turizam",
    "email": "info@iztzg.hr",
    "dostava": "DA",
    "oib": "10264179101"
  },
  {
    "name": "Institut za jadranske kulture i melioraciju krša",
    "email": "Katja.Zanic@krs.hr",
    "dostava": "DA",
    "oib": "90884993104"
  },
  {
    "name": "Institut za oceanografiju i ribarstvo",
    "email": "office@izor.hr",
    "dostava": "NE",
    "oib": "86235185568"
  },
  {
    "name": "Institut za medicinska istraživanja i medicinu rada",
    "email": "info@imi.hr",
    "dostava": "DA",
    "oib": "30285469659"
  },
  {
    "name": "Institut za poljoprivredu i turizam",
    "email": "institut@iptpo.hr",
    "dostava": "DA",
    "oib": "03850982961"
  },
  {
    "name": "Hrvatski geološki institut",
    "email": "ured@hgi-cgs.hr",
    "dostava": "DA",
    "oib": "43733878539"
  },
  {
    "name": "Hrvatski institut za povijest",
    "email": "info@hipzg.hr",
    "dostava": "DA",
    "oib": "23296176633"
  },
  {
    "name": "Staroslavenski institut",
    "email": "info@stin.hr",
    "dostava": "DA",
    "oib": "15291942541"
  },
  {
    "name": "Institut za arheologiju",
    "email": "iarh@iarh.hr",
    "dostava": "NE",
    "oib": "59796264563"
  },
  {
    "name": "Leksikografski zavod Miroslav Krleža",
    "email": "lzmk@lzmk.hr",
    "dostava": "DA",
    "oib": "49894241709"
  },
  {
    "name": "Institut društvenih znanosti Ivo Pilar",
    "email": "ured@pilar.hr",
    "dostava": "DA",
    "oib": "32840574937"
  },
  {
    "name": "Hrvatski veterinarski institut",
    "email": "humski@veinst.hr",
    "dostava": "DA",
    "oib": "29059177553"
  },
  {
    "name": "Institut za vode Josip Juraj Strossmayer",
    "email": "institut@institutjjs.hr",
    "dostava": "DA",
    "oib": "04716643151"
  },
  {
    "name": "Institut za javne financije",
    "email": "ured@ijf.hr",
    "dostava": "DA",
    "oib": "41683226810"
  },
  {
    "name": "Institut za antropologiju",
    "email": "ured@inantro.hr",
    "dostava": "DA",
    "oib": "93710699926"
  },
  {
    "name": "Institut za filozofiju",
    "email": "filozof@ifzg.hr",
    "dostava": "DA",
    "oib": "43667021597"
  },
  {
    "name": "Hrvatski šumarski institut",
    "email": "ured@sumins.hr",
    "dostava": "DA",
    "oib": "13579392023"
  },
  {
    "name": "Energetski institut Hrvoje Požar",
    "email": "eihp@eihp.hr",
    "dostava": "Dopis",
    "oib": "43980170614"
  },
  {
    "name": "Institut za sigurnost",
    "email": "info@izs.hr",
    "dostava": "NE",
    "oib": null
  },
  {
    "name": "Institut prometa i veza",
    "email": "ipv@ipv-zg.hr",
    "dostava": "NE",
    "oib": null
  },
  {
    "name": "Klinički bolnički centar Zagreb",
    "email": "kbc-zagreb@kbc-zagreb.hr",
    "dostava": "DA",
    "oib": "46377257342"
  },
  {
    "name": "Klinički bolnički centar Split",
    "email": "office@kbsplit.hr",
    "dostava": "DA",
    "oib": "51401063283"
  },
  {
    "name": "Klinički bolnički centar Rijeka",
    "email": "opca.tehnicka@kbc-rijeka.hr",
    "dostava": "NE",
    "oib": "40237608715"
  },
  {
    "name": "Klinički bolnički centar Osijek",
    "email": "ravnateljstvo@kbco.hr",
    "dostava": "DA",
    "oib": "89819375646"
  },
  {
    "name": "Klinička bolnica Dubrava",
    "email": "ravnatelj@kbd.hr",
    "dostava": "DA",
    "oib": "32206148371"
  },
  {
    "name": "Klinička bolnica Merkur",
    "email": "ravnateljstvo@kb-merkur.hr",
    "dostava": "DA",
    "oib": "25883882856"
  },
  {
    "name": "Klinički bolnički centar Sestre milosrdnice",
    "email": "ravnateljstvo@kbcsm.hr",
    "dostava": "DA",
    "oib": "84924656517"
  },
  {
    "name": "Klinika za dječje bolesti Zagreb",
    "email": "ured.ravnatelja@kdb.hr",
    "dostava": "DA",
    "oib": "70641763756"
  },
  {
    "name": "Klinika za infektivne bolesti dr.  Fran Mihaljević",
    "email": "bfm@bfm.hr",
    "dostava": "DA",
    "oib": "47767714195"
  },
  {
    "name": "Hrvatski zavod za javno zdravstvo",
    "email": "ravnateljstvo@hzjz.hr",
    "dostava": "DA",
    "oib": "75297532041"
  },
  {
    "name": "Hrvatski zavod za hitnu medicinu",
    "email": "info@hzhm.hr",
    "dostava": "DA",
    "oib": "45218167072"
  },
  {
    "name": "Hrvatski zavod za transfuzijsku medicinu",
    "email": "hztm@hztm.hr",
    "dostava": "DA",
    "oib": "61248075289"
  },
  {
    "name": "Javna zdravstvena ustanova Imunološki zavod",
    "email": "ured@imz.hr",
    "dostava": "NE",
    "oib": "51786203438"
  },
  {
    "name": "Hrvatsko narodno kazalište u Zagrebu",
    "email": "tehnika@hnk.hr",
    "dostava": "DA",
    "oib": "10852199405"
  },
  {
    "name": "Hrvatsko narodno kazalište u Splitu",
    "email": "tehnika@hnk-split.hr",
    "dostava": "NE",
    "oib": "69204356406"
  },
  {
    "name": "Hrvatski državni arhiv",
    "email": "ured@arhiv.hr",
    "dostava": "NE",
    "oib": "46144176176"
  },
  {
    "name": "Nacionalna i sveučilišna knjižnica u Zagrebu",
    "email": "uprava@nsk.hr",
    "dostava": "DA",
    "oib": "84838770814"
  },
  {
    "name": "Hrvatski restauratorski zavod",
    "email": "uprava@hrz.hr",
    "dostava": "DA",
    "oib": "08647229584"
  },
  {
    "name": "Agencija za elektroničke medije",
    "email": "miro.krizan@aem.hr",
    "dostava": "DA",
    "oib": "35237547014"
  },
  {
    "name": "Hrvatski audiovizualni centar",
    "email": "ured.ravnatelja@havc.hr",
    "dostava": "NE",
    "oib": "27103918402"
  },
  {
    "name": "Državna agencija za osiguranje štednih uloga i sanaciju banaka",
    "email": "dab@dab.hr",
    "dostava": "NE",
    "oib": "94819327944"
  },
  {
    "name": "Agencija za odgoj i obrazovanje",
    "email": "agencija@azoo.hr",
    "dostava": "DA",
    "oib": "72193628411"
  },
  {
    "name": "Agencija za lijekove i medicinske proizvode (HALMED)",
    "email": "sinisa.tomic@halmed.hr",
    "dostava": "DA",
    "oib": "37926884937"
  },
  {
    "name": "Agencija za strukovno obrazovanje i obrazovanje odraslih",
    "email": "ured@asoo.hr",
    "dostava": "DA",
    "oib": "40719411729"
  },
  {
    "name": "Agencija za mobilnost i programe EU",
    "email": "ured@ampeu.hr",
    "dostava": "NE",
    "oib": "25385906011"
  },
  {
    "name": "Agencija za znanost i visoko obrazovanje",
    "email": "ured@azvo.hr",
    "dostava": "DA",
    "oib": "83358955356"
  },
  {
    "name": "Agencija za mobilnost i programe Europske unije (AMPEU)",
    "email": "info@ampeu.hr",
    "dostava": "DA",
    "oib": "25385906011"
  },
  {
    "name": "Agencija za istraživanje nesreća u zračnom, pomorskom i željezničkom prometu",
    "email": "ured.ravnatelja@ain.hr",
    "dostava": "DA",
    "oib": "40956403978"
  },
  {
    "name": "Agencija za obalni linijski pomorski promet",
    "email": "info@agencija-zolpp.hr",
    "dostava": "DA",
    "oib": "27735395987"
  },
  {
    "name": "Nacionalni centar za vanjsko vrednovanje obrazovanja",
    "email": "ncvvo@ncvvo.hr",
    "dostava": "NE",
    "oib": "94833993984"
  },
  {
    "name": "Sveučilište u Zagrebu",
    "email": "rector@unizg.hr",
    "dostava": "NE",
    "oib": "36612267447"
  },
  {
    "name": "Sveučilište u Zadru",
    "email": "jfaricic@unizd.hr",
    "dostava": "DA",
    "oib": "10839679016"
  },
  {
    "name": "Sveučilište u Splitu",
    "email": "ivana.pletkovic@unist.hr",
    "dostava": "DA",
    "oib": "29845096215"
  },
  {
    "name": "Sveučilište u Rijeci",
    "email": "ured@uniri.hr",
    "dostava": "DA",
    "oib": "64218323816"
  },
  {
    "name": "Sveučilište u Dubrovniku",
    "email": "nebojsa.stojcic@unidu.hr",
    "dostava": "DA",
    "oib": "01338491514"
  },
  {
    "name": "Sveučilište Josipa Jurja Strossmayera u Osijeku",
    "email": "rektorat@unios.hr",
    "dostava": "NE",
    "oib": "78808975734"
  },
  {
    "name": "ACI d.d., Rijeka",
    "email": "sanja.ljubetic@aci-club.hr",
    "dostava": "DA",
    "oib": "17195049659"
  },
  {
    "name": "Agencija Alan d.o.o.",
    "email": "sjelacic@aalan.hr",
    "dostava": "NE",
    "oib": "83317234406"
  },
  {
    "name": "Centar za restrukturiranje i prodaju (CERP)",
    "email": "blazenka.razum@cerp.hr",
    "dostava": "DA",
    "oib": "38083028711"
  },
  {
    "name": "Croatia Airlines d.d.",
    "email": "ana-marija.jurkovic@croatiaairlines.hr",
    "dostava": "DA",
    "oib": "24640993045"
  },
  {
    "name": "Državne nekretnine d.o.o.",
    "email": "matea.nevrkla@hr-nekretnine.hr",
    "dostava": "DA",
    "oib": "79058504140"
  },
  {
    "name": "HP - Hrvatska pošta d.d.",
    "email": "zeljka.stampf@posta.hr",
    "dostava": "DA",
    "oib": "87311810356"
  },
  {
    "name": "Hrvatska radiotelevizija (HRT)",
    "email": "tomislav.cvrtila@hrt.hr",
    "dostava": "DA",
    "oib": "68419124305"
  },
  {
    "name": "Hrvatska banka za obnovu i razvitak (HBOR)",
    "email": "dantolovic@hbor.hr",
    "dostava": "DA",
    "oib": "26702280390"
  },
  {
    "name": "Hrvatska elektroprivreda d.d. (HEP d.d.)",
    "email": "manda.puskaric@hep.hr",
    "dostava": "DA",
    "oib": "28921978587"
  },
  {
    "name": "Hrvatska kontrola zračne plovidbe d.o.o.",
    "email": "ivana.hrvat@crocontrol.hr",
    "dostava": "Dopis",
    "oib": "33052761319"
  },
  {
    "name": "Hrvatska lutrija d.o.o.",
    "email": "matija.stefanac@lutrija.hr",
    "dostava": "DA",
    "oib": "27905228158"
  },
  {
    "name": "Hrvatska poštanska banka d.d. (HPB d.d.)",
    "email": "snjezana.cop@hpb.hr",
    "dostava": "DA",
    "oib": "87939104217"
  },
  {
    "name": "Hrvatske autoceste d.o.o.",
    "email": "nikolina.tripkovic@hac.hr",
    "dostava": "DA",
    "oib": "57500462912"
  },
  {
    "name": "Hrvatske ceste d.o.o.",
    "email": "nikolina.tripkovic@hac.hr",
    "dostava": "NE",
    "oib": "55545787885"
  },
  {
    "name": "Hrvatske šume d.o.o.",
    "email": "ivica.milkovic@hrsume.hr",
    "dostava": "DA",
    "oib": "69693144506"
  },
  {
    "name": "Hrvatske vode",
    "email": "domagoj.glavica@voda.hr",
    "dostava": "NE",
    "oib": "28921383001"
  },
  {
    "name": "Hrvatski operator tržišta energije d.o.o.",
    "email": "tatjana.medvedec@hrote.hr",
    "dostava": "DA",
    "oib": "75801633608"
  },
  {
    "name": "HŽ Cargo d.o.o.",
    "email": "robert.franjkovic@hzcargo.hr",
    "dostava": "DA",
    "oib": "08720210702"
  },
  {
    "name": "HŽ Infrastruktura d.o.o.",
    "email": "mira.grbac@hzinfra.hr",
    "dostava": "NE",
    "oib": "39901919995"
  },
  {
    "name": "HŽ Putnički prijevoz d.o.o.",
    "email": "iva.slunjski@hzpp.hr",
    "dostava": "DA",
    "oib": "80572192786"
  },
  {
    "name": "INA - Industrija nafte d.d.",
    "email": "silvana.vojnovic@ina.hr",
    "dostava": "Dopis",
    "oib": null
  },
  {
    "name": "Jadrolinija, Rijeka",
    "email": "uprava@jadrolinija.hr",
    "dostava": "DA",
    "oib": "38453148181"
  },
  {
    "name": "Jadranski naftovod d.d. (Janaf d.d.)",
    "email": "mia.maric@janaf.hr",
    "dostava": "NE",
    "oib": "89018712265"
  },
  {
    "name": "Narodne novine d.d.",
    "email": "ivana.ivancic@nn.hr",
    "dostava": "NE",
    "oib": "64546066176"
  },
  {
    "name": "Plovput d.o.o.",
    "email": "goran.senta@oiv.hr",
    "dostava": "NE",
    "oib": "14480721492"
  },
  {
    "name": "Zračna luka Dubrovnik d.o.o., Čilipi",
    "email": "pepo.deranja@airport-dubrovnik.hr",
    "dostava": "DA",
    "oib": "63145279942"
  },
  {
    "name": "Zračna luka Osijek d.o.o., Klisa",
    "email": "sanela.vidic@osijek-airport.hr",
    "dostava": "DA",
    "oib": "48188420009"
  },
  {
    "name": "Zračna luka Pula d.o.o., Ližnjan",
    "email": "nina.vojnic@airport-pula.hr",
    "dostava": "DA",
    "oib": "51946493681"
  },
  {
    "name": "Zračna luka Rijeka d.o.o., Omišalj",
    "email": "ntomic@rijeka-airport.hr",
    "dostava": "DA",
    "oib": "37940245720"
  },
  {
    "name": "Zračna luka Split d.o.o., Kaštel Štafilić",
    "email": "josip.coric@split-airport.hr",
    "dostava": "NE",
    "oib": "83462362655"
  },
  {
    "name": "Zračna luka Zadar d.o.o., Zemunik Donji",
    "email": "marina.zugaj@zadar-airport.hr",
    "dostava": "DA",
    "oib": "39087623202"
  },
  {
    "name": "Zračna luka Zagreb d.o.o. Zagreb",
    "email": "headoffice@zagreb-airport.hr",
    "dostava": "DA",
    "oib": "60482636839"
  },
  {
    "name": "Akademija socijalne skrbi",
    "email": "pisarnica@asosk.hr",
    "dostava": "DA",
    "oib": "86317641207"
  },
  {
    "name": "Centar za mirno rješavanje sporova",
    "email": "cmrs@cmrs.hr",
    "dostava": "NE",
    "oib": "80113121575"
  }
]

export const DII_REGISTRY_TOTAL = DII_REGISTRY.length

/** OIB-ovi tijela koja su dostavila (DA ili Dopis) prema Excelu */
export const DII_DELIVERED_OIBS = new Set(
  DII_REGISTRY.filter(e => e.oib && (e.dostava === 'DA' || e.dostava === 'Dopis')).map(e => e.oib!)
)
