# QPM 0.7.3 — Audit fonctionnel, menus et interface de configuration

Date : 11 juillet 2026

## 1. Résumé exécutif

QPM couvre désormais de manière cohérente le cycle principal d'un projet Qt dans VS Code : création, kits, builds direct/qmake/CMake, MOC/UIC/RCC, exécution, débogage, tests, qualité, outils Qt et plusieurs plateformes. La 0.7.3 corrige principalement la densité de l'interface : les actions de clic droit sont regroupées sous une racine QPM et la page de paramètres devient un centre de contrôle filtrable et documenté.

Le scénario le plus mature reste Qt 6 Widgets sous Windows avec MinGW 64 bits et backend direct. qmake, CMake, MSVC, Linux local, Remote Linux, Docker et WebAssembly sont modélisés et testés par simulation, mais nécessitent encore davantage de validations physiques et de tests d'intégration multi-plateformes.

## 2. Mesures du projet audité

| Élément | Valeur |
|---|---:|
| Version | 0.7.3 |
| Schéma `.qtproject.json` | 7 |
| Fichiers TypeScript | 44 |
| Lignes TypeScript | 50 818 |
| Commandes VS Code | 197, toutes uniques |
| Vues QPM | 10 |
| Sous-menus déclarés | 24 |
| Points de menu | 30 |
| Entrées de menu | 256 |
| Paramètres globaux VS Code | 68 |
| Scripts de test | 39 |
| Packs JC Lib intégrés | 6 |

Fichiers les plus volumineux :

| Fichier | Taille approximative |
|---|---:|
| `src/jcLibEmbedded.ts` | 1,42 Mo |
| `src/services/qpmTemplateService.ts` | 235 ko |
| `src/services/qpmEditorUtilitiesService.ts` | 131 ko |
| `src/services/qpmBuildService.ts` | 99 ko |
| `src/views/qtProjectSettingsPanel.ts` | 93 ko |

Ces volumes sont encore acceptables à l'exécution, mais ils augmentent le coût de maintenance et le risque de régression. La prochaine phase structurelle devrait découper ces fichiers en modules par domaine.

## 3. Audit des menus contextuels

### 3.1 État avant 0.7.3

Le clic droit dans l'éditeur mélangeait :

- un groupe QPM structuré ;
- plusieurs commandes QPM directes au niveau racine ;
- les tests, Clang-Tidy et Clazy en dehors du groupe principal ;
- des actions spécialisées difficiles à retrouver lorsque leur nombre augmentait.

### 3.2 Structure introduite

Le clic droit de l'éditeur expose désormais une seule racine :

```text
QPM
├── Project / configuration
├── Build / run / debug
├── Qt Tools
│   ├── Resources
│   ├── QML
│   └── Translations
├── Tests / quality
├── Documentation / comments
├── Snippets
└── Utilities
```

L'Explorateur VS Code applique le même principe avec une seule racine QPM et des actions dépendant de l'extension du fichier.

Les conditions `when` limitent les actions aux fichiers pertinents : C/C++, QML, `.ui`, `.qrc`, `.ts`, `.xlf` et manifests QPM. Les commandes ne polluent donc plus les autres types de fichiers.

### 3.3 Points restant à améliorer

- Appliquer le même niveau de regroupement aux menus de nœuds internes de la vue QPM si leur densité augmente encore.
- Ajouter des icônes cohérentes aux sous-groupes lorsque VS Code permettra un rendu suffisamment stable.
- Mettre en place un test d'intégration VS Code réel pour vérifier le rendu des sous-menus, en complément des tests structurels du manifeste.

## 4. Audit de Qt Project Settings

### 4.1 Couverture actuelle

La page permet de modifier directement :

- nom, cible, type de projet et standard C++ ;
- architecture et variante Debug/Release ;
- backend direct, qmake ou CMake ;
- modules Qt ;
- MOC, UIC, RCC, unity build, PCH et response files ;
- définitions, includes, bibliothèques et flags ;
- paramètres d'exécution et environnement ;
- profil de plateforme actif et tous ses champs Remote Linux, Docker ou WebAssembly ;
- profil de débogage actif : launch, attach, GDB Server, dump et QML ;
- tests et qualité ;
- actions de pré-build, build personnalisé et post-build ;
- état des fichiers du projet.

Elle donne accès depuis le même écran aux gestionnaires spécialisés :

- profils ;
- profils de débogage ;
- plateformes ;
- kits nommés ;
- installation Qt et réparation du compilateur ;
- Qt Designer ;
- manifeste JSON ;
- IntelliSense, santé du projet, tests, qualité, traductions, QML et documentation.

### 4.2 Améliorations 0.7.3

- filtre instantané sur les sections et champs ;
- navigation directe par section ;
- barre d'actions persistante ;
- indicateur de modifications non enregistrées ;
- bouton Reload pour abandonner les modifications locales ;
- sélecteurs pour les valeurs fermées ;
- suggestions pour Clang-Tidy, Clazy, filtres de headers, services QML, images Docker et serveurs WebAssembly ;
- boutons de parcours de fichier ou dossier pour les chemins ;
- champs conditionnels selon le backend, la plateforme et le type de débogage ;
- aide contextuelle par point d'interrogation, utilisable à la souris et au clavier ;
- thèmes, couleurs et contrôles issus des variables VS Code ;
- labels ARIA sur les contrôles interactifs principaux.

L'audit statique recense 126 identifiants de contrôle. Tous les champs métier disposent d'une aide contextuelle ; seuls le filtre et le sélecteur de navigation utilisent une description ARIA directe plutôt qu'un point d'interrogation.

### 4.3 Limites de la page actuelle

- La page édite le profil actif. La création, duplication, suppression et réorganisation des profils restent dans des gestionnaires spécialisés.
- Les propriétés détaillées d'un kit nommé sont affichées en synthèse puis modifiées dans le gestionnaire de kits.
- La liste des fichiers est principalement informative ; l'ajout et la suppression se font depuis l'arborescence QPM.
- La validation est essentiellement effectuée à l'enregistrement. Il manque une validation inline complète avec messages par champ.
- La fermeture de la webview ne demande pas encore confirmation lorsqu'il existe des modifications non sauvegardées.
- L'interface n'est pas encore localisée en français/anglais via les mécanismes de localisation VS Code.

### 4.4 Recommandations UI prioritaires

1. Ajouter une validation instantanée des ports, chemins, IDs de profils et incompatibilités kit/architecture.
2. Ajouter un dialogue de confirmation avant fermeture ou rechargement avec modifications non sauvegardées.
3. Ajouter un sélecteur direct des profils actifs dans la page, avec rechargement immédiat des champs.
4. Ajouter l'import/export de profils de kit, build, run, deploy, debug et plateforme.
5. Ajouter une vue diff avant migration ou réécriture du manifeste.
6. Localiser l'interface et les aides.
7. Ajouter des tests d'accessibilité automatisés sur le HTML généré.

## 5. Couverture fonctionnelle comparée à Qt Creator

### 5.1 Couverture forte

| Domaine | État QPM |
|---|---|
| Projets Qt Widgets/Quick/Console/Test/Bibliothèques | Bon |
| Backend direct MOC/UIC/RCC | Très bon sur Qt 6 MinGW Windows |
| qmake et CMake | Opérationnels, validation physique à élargir |
| Kits et profils | Bon |
| IntelliSense et compile database | Bon |
| Qt Designer et QRC | Bon |
| Linguist, traductions | Bon |
| QML lint/format/preview | Correct |
| Tests Qt/Quick/GoogleTest/Catch2 | Bon |
| Clang-Tidy, Clazy, sanitizers, gcov | Correct selon outils installés |
| GDB/LLDB/CDB, attach, GDB Server, dumps, QML debug | Bon sur le plan de configuration |
| Desktop, Linux, Remote Linux, Docker, WebAssembly | Modélisé et pilotable |
| JC Lib et snippets | Très riche |

### 5.2 Couverture partielle

| Domaine | Écart principal |
|---|---|
| Édition C++ et refactoring | Déléguée à Microsoft C/C++ ou clangd ; pas de modèle de code Qt propre à QPM |
| Édition QML | Pas encore de `qmlls` géré, navigation/refactoring QML limitée |
| CMake avancé | Pas de vue complète des targets, cache, presets multi-configurations et CMake File API |
| Déploiement | Copie des runtimes et profils distants, mais peu de packaging produit |
| Debug Qt | Pretty-printers/Natvis détectés, mais expérience réelle dépend des adapters installés |
| Plateformes | Android/iOS/QNX/VxWorks/MCU absents |
| Analyse | Outils statiques et couverture présents, profilage temporel/mémoire absent |

### 5.3 Fonctionnalités importantes encore absentes

1. **Packaging desktop et produit**
   - métadonnées version/éditeur/description ;
   - icône, manifeste Windows et ressources de version ;
   - ZIP portable ;
   - CPack, NSIS ou Inno Setup ;
   - signature de code ;
   - règles de publication.

2. **QML avancé**
   - intégration et configuration de `qmlls` ;
   - QML Profiler avec timeline ;
   - live preview/reload plus robuste ;
   - gestion des URI, `qmldir`, modules et types QML ;
   - assistants de migration et validation des imports.

3. **Profilage et diagnostic d'exécution**
   - Performance Analyzer/perf ;
   - Valgrind Memcheck et Callgrind ;
   - Heob sous Windows ;
   - Cppcheck ;
   - visualisation Chrome Trace ;
   - flame graphs et rapports mémoire.

4. **Tests complémentaires**
   - Boost.Test ;
   - CTest et tests remontés par CMake ;
   - tests GUI/Squish lorsque l'outil est installé ;
   - historique des campagnes et comparaison de couverture.

5. **Android et appareils**
   - SDK, NDK, JDK, Gradle et `androiddeployqt` ;
   - APK/AAB ;
   - ADB, logcat et sélection de périphérique ;
   - signature et déploiement Google Play ;
   - gestion d'émulateurs.

6. **Cibles embarquées et Apple**
   - QNX, VxWorks, bare-metal/MCU ;
   - macOS/iOS, Xcode et signature Apple ;
   - gestion de sysroots et appareils plus structurée.

7. **Ingénierie et maintenance**
   - CI réelle Windows/Linux avec matrices Qt/MinGW/MSVC/Clang ;
   - tests d'intégration VS Code avec `@vscode/test-electron` ;
   - tests physiques qmake/CMake/SSH/Docker/WebAssembly ;
   - découpage des cinq plus gros modules ;
   - ESLint strict, mesure de couverture de l'extension et tests d'accessibilité.

## 6. Roadmap recommandée après 0.7.3

### 0.8.0 — Packaging et métadonnées produit

- propriétés de version, société, description et copyright ;
- icône et manifeste ;
- windeployqt/macdeployqt/linuxdeploy selon plateforme ;
- ZIP, CPack, NSIS/Inno Setup ;
- signature et rapport de dépendances ;
- profils de publication.

### 0.9.0 — Profilage, diagnostic et tests étendus

- QML Profiler ;
- perf/Performance Analyzer ;
- Valgrind Memcheck/Callgrind ;
- Heob Windows ;
- Cppcheck ;
- CTest et Boost.Test ;
- rapports de performance et couverture persistants.

### 0.10.0 — Android et gestion des appareils

- détection SDK/NDK/JDK ;
- kits Android ;
- Gradle/androiddeployqt ;
- APK/AAB, ADB, logcat ;
- déploiement, run et debug sur appareil/émulateur.

### 0.11.0 — QML et code model avancés

- `qmlls` ;
- imports/modules/URI ;
- navigation, diagnostics et refactoring QML ;
- preview/live reload ;
- intégration Qt Design Studio.

### 1.0.0 — Stabilisation

- modularisation des gros services ;
- migration figée et documentée du schéma ;
- tests VS Code réels ;
- CI multi-OS et multi-toolchain ;
- localisation ;
- documentation utilisateur complète ;
- télémétrie absente par défaut et diagnostics exportables ;
- critères de compatibilité et politique de versionnement.

## 7. Conclusion

QPM a dépassé le stade du simple gestionnaire de build Qt. Son périmètre actuel couvre déjà une grande partie de la chaîne de développement proposée par Qt Creator, avec l'avantage spécifique d'un backend Qt direct et d'une intégration poussée dans VS Code.

Le principal risque n'est plus l'absence d'une fonctionnalité fondamentale, mais l'accumulation de fonctionnalités dans quelques modules très volumineux et la validation encore trop simulée des cibles non Windows/MinGW. La prochaine valeur forte vient donc d'un couple : packaging produit visible pour l'utilisateur et consolidation technique/CI pour sécuriser les plateformes avancées.

## 8. Références officielles utilisées pour la comparaison

- Visual Studio Code Extension API — Context Menus.
- Visual Studio Code Extension API — Webviews UX Guidelines.
- Qt Creator 20 — Overview.
- Qt Creator 20 — Analyzing code.
