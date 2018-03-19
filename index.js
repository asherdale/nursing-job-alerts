const rp = require('request-promise'),
  cheerio = require('cheerio'),
  express = require('express'),
  app = express(),
  admin = require('firebase-admin'),
  firebaseServiceAccount = require('./hannah-nursing-job-alert-firebase-adminsdk-phu0e-5ef1be0dff.json'),
  nodemailer = require('nodemailer'),
  passwords = require('./passwords');

app.get("/", async function(req, res, next) {
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify({ status: 'OK', response: await getNurseAlert() }));
});

console.log('Express listening.. on 3000');
app.listen(3000);

admin.initializeApp({
  credential: admin.credential.cert(firebaseServiceAccount),
  databaseURL: 'https://hannah-nursing-job-alert.firebaseio.com'
});
const database =  admin.database();

const WEBSITE_TO_SCRAPE_URL = 'https://www.healthcaresource.com/steward/index.cfm?&iregionid=1&template=dsp_job_list%2Ecfm&ifacilityid=910098025&cjoborderby=&ijobpostondaysold=&ijobcatid=105&cjobattr2=All&cjobattr1=All&ijobrowstart=1&ckeywordsearchcategory=cdept%2C%20mdes%2C%20creqnum&ilocationid=%24all&nkeywordsearch=&fuseaction=search%2EjobList';
const FIREBASE_FIELD = 'mostRecentJobId';

async function getNurseAlert () {
  try {
    var options = {uri: WEBSITE_TO_SCRAPE_URL, transform: body => cheerio.load(body)};
    const $ = await rp(options);

    const firstRow = $('tbody').eq(1).find('tr').eq(0);
    const firstJob = firstRow.children('td.center').toArray().map((el) => {
      return $(el).text().trim();
    });

    const newJobId = firstJob.join('-').toLowerCase();
    return checkCurrentFirstJob(newJobId);
  } catch (error) {
    console.error(error);
  }
}

async function checkCurrentFirstJob (newJobId) {
  const firebaseData = await readDataFromFirebase(`/${FIREBASE_FIELD}`);
  if (newJobId !== firebaseData.val()) {
    await writeDataToFirebase('/', {[FIREBASE_FIELD]: newJobId});
    sendEmail();
    return 'NEW JOB';
  }
  return 'OLD JOB'
}

async function readDataFromFirebase (path, data) {
  return database.ref(path).once('value');
}

async function writeDataToFirebase (path, data) {
  return database.ref(path).set(data);
}

function sendEmail () {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: passwords.emailUsername,
      pass: passwords.emailPassword
    }
  });

  const mailOptions = {
    from: passwords.emailUsername,
    to: passwords.recipientEmail, 
    subject: 'Nurse Job Alert',
    text: passwords.message
  };

  transporter.sendMail(mailOptions, function(error, info){
    if (error) {
      console.log(error);
    } else {
      console.log('Email sent: ' + info.response);
    }
  });
}
