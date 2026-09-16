/**
 * Injecte une signingConfig `release` dans le `android/app/build.gradle` généré par
 * `expo prebuild`, et bascule le buildType `release` dessus.
 *
 * Pourquoi ce script : les dossiers natifs ne sont pas versionnés (CNG), ils sont
 * régénérés à chaque build. Le template Expo signe le buildType `release` avec le
 * **keystore de debug** ; sans ce patch, la CI produirait un APK signé par la clé de
 * debug — installable, mais impossible à mettre à jour ensuite avec une vraie clé.
 *
 * Le script échoue bruyamment si les points d'ancrage attendus ont disparu (montée de
 * version d'Expo / du template). C'est volontaire : mieux vaut un job rouge qu'un APK
 * silencieusement signé en debug.
 *
 * Les mots de passe ne sont jamais écrits sur disque : le Gradle généré les lit dans
 * l'environnement du process (ANDROID_KEYSTORE_*).
 */
import fs from 'node:fs';

const GRADLE_PATH = 'android/app/build.gradle';

function fail(message) {
  console.error(`\n✗ apply-release-signing: ${message}`);
  console.error(`  Fichier concerné : ${GRADLE_PATH}`);
  console.error('  Le template Expo a probablement changé — adaptez ce script.\n');
  process.exit(1);
}

/** Retourne [start, end] du corps de `name { … }` à partir de `from`, accolades équilibrées. */
function blockRange(source, name, from = 0) {
  const header = new RegExp(`\\b${name}\\s*\\{`, 'g');
  header.lastIndex = from;
  const m = header.exec(source);
  if (!m) return null;
  const open = m.index + m[0].length - 1;
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return [open + 1, i];
    }
  }
  return null;
}

if (!fs.existsSync(GRADLE_PATH)) fail('fichier introuvable — `expo prebuild` a-t-il bien tourné ?');
let gradle = fs.readFileSync(GRADLE_PATH, 'utf8');

if (gradle.includes('signingConfigs.release')) {
  console.log('✓ signingConfig release déjà présente, rien à faire');
  process.exit(0);
}

// 1. Ajouter la signingConfig `release` à côté de `debug`.
const signingConfigs = blockRange(gradle, 'signingConfigs');
if (!signingConfigs) fail('bloc `signingConfigs { … }` introuvable');
const releaseConfig = `
        release {
            storeFile file(System.getenv("ANDROID_KEYSTORE_PATH"))
            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias System.getenv("ANDROID_KEY_ALIAS")
            keyPassword System.getenv("ANDROID_KEY_PASSWORD")
        }
`;
gradle = gradle.slice(0, signingConfigs[0]) + releaseConfig + gradle.slice(signingConfigs[0]);

// 2. Faire pointer le buildType `release` dessus (et lui seul : `debug` garde sa clé de debug).
const buildTypes = blockRange(gradle, 'buildTypes');
if (!buildTypes) fail('bloc `buildTypes { … }` introuvable');
const releaseType = blockRange(gradle, 'release', buildTypes[0]);
if (!releaseType || releaseType[1] > buildTypes[1]) fail('buildType `release` introuvable dans `buildTypes`');

const body = gradle.slice(releaseType[0], releaseType[1]);
if (!body.includes('signingConfig signingConfigs.debug')) {
  fail('`signingConfig signingConfigs.debug` attendu dans le buildType `release`');
}
const patchedBody = body.replace('signingConfig signingConfigs.debug', 'signingConfig signingConfigs.release');
gradle = gradle.slice(0, releaseType[0]) + patchedBody + gradle.slice(releaseType[1]);

fs.writeFileSync(GRADLE_PATH, gradle);
console.log('✓ buildType release signé avec la clé de release (variables ANDROID_KEYSTORE_*)');
