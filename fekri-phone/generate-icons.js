import Jimp from 'jimp';

async function generateIcons() {
    console.log('Reading logo.jpg...');
    const image = await Jimp.read('public/assets/logo.jpg');

    console.log('Generating 192x192 icon...');
    await image.clone().resize(192, 192).writeAsync('public/icons/icon-192x192.png');

    console.log('Generating 512x512 icon...');
    await image.clone().resize(512, 512).writeAsync('public/icons/icon-512x512.png');

    console.log('Successfully generated PNG icons for PWA installability!');
}

generateIcons().catch(console.error);
