const fs = require('fs');
const https = require('https');

const urls = [
  'https://raw.githubusercontent.com/CCOSTAN/Home-AssistantConfig/master/config/sounds/one-tone-chime.mp3',
  'https://github.com/CCOSTAN/Home-AssistantConfig/raw/master/config/sounds/one-tone-chime.mp3'
];

const outputPath = 'c:/Users/Bharathi-Zithtech/Desktop/zithspace1/zithspace-fe/public/notification.mp3';

function download(index) {
  if (index >= urls.length) {
    console.error('❌ Failed to download sound from all mirrors.');
    return;
  }

  const fileUrl = urls[index];
  console.log(`Trying to download from: ${fileUrl}`);

  const file = fs.createWriteStream(outputPath);

  const request = https.get(fileUrl, function(response) {
    // Handle redirects
    if (response.statusCode === 302 || response.statusCode === 301) {
      file.close();
      fs.unlink(outputPath, () => {});
      const redirectUrl = response.headers.location;
      console.log(`Following redirect to: ${redirectUrl}`);
      
      const redirectFile = fs.createWriteStream(outputPath);
      https.get(redirectUrl, function(res2) {
        if (res2.statusCode === 200) {
          res2.pipe(redirectFile);
          redirectFile.on('finish', function() {
            redirectFile.close();
            console.log('✅ Custom sound file (notification.mp3) downloaded successfully!');
          });
        } else {
          redirectFile.close();
          fs.unlink(outputPath, () => {});
          console.warn(`Redirect failed with status: ${res2.statusCode}`);
          download(index + 1);
        }
      });
      return;
    }

    if (response.statusCode === 200) {
      response.pipe(file);
      file.on('finish', function() {
        file.close();
        console.log('✅ Custom sound file (notification.mp3) downloaded successfully!');
      });
    } else {
      file.close();
      fs.unlink(outputPath, () => {});
      console.warn(`Failed with status: ${response.statusCode}`);
      download(index + 1);
    }
  });

  request.on('error', function(err) {
    file.close();
    fs.unlink(outputPath, () => {});
    console.error(`Network error: ${err.message}`);
    download(index + 1);
  });
}

download(0);
