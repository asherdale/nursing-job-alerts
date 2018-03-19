const rp = require('request-promise'),
  cheerio = require('cheerio'),
  express = require('express'),
  app = express(),
  admin = require('firebase-admin'),
  firebaseServiceAccount = require('./hannah-nursing-job-alert-firebase-adminsdk-phu0e-5ef1be0dff.json'),
  nodemailer = require('nodemailer'),
  passwords = require('./passwords');

const WEBSITE_TO_SCRAPE_URL = 'https://www.healthcaresource.com/steward/index.cfm?&iregionid=1&template=dsp_job_list%2Ecfm&ifacilityid=910098025&cjoborderby=&ijobpostondaysold=&ijobcatid=105&cjobattr2=All&cjobattr1=All&ijobrowstart=1&ckeywordsearchcategory=cdept%2C%20mdes%2C%20creqnum&ilocationid=%24all&nkeywordsearch=&fuseaction=search%2EjobList';
const FIREBASE_FIELD = 'mostRecentJobId';

admin.initializeApp({
  credential: admin.credential.cert(firebaseServiceAccount),
  databaseURL: passwords.database
});
const database =  admin.database();

const port = process.env.PORT || 8080;
console.log(`Express listening... on ${port}`);
app.listen(port);
app.get("/", routeRequest);

async function routeRequest (req, res, next) {
  res.setHeader('Content-Type', 'application/json');
  try{
    res.send(JSON.stringify({ status: 'OK', response: await nurseAlert() }));
  } catch (error) {
    res.send(JSON.stringify({ status: 500, response: error }));
  }
}

async function nurseAlert () {
  try {
    var options = {uri: WEBSITE_TO_SCRAPE_URL, transform: body => cheerio.load(body)};
    const $ = await rp(options);

    const firstRow = $('tbody').eq(1).find('tr').eq(0);
    const firstJob = firstRow.children('td.center').toArray().map((el) => {
      return $(el).text().trim();
    });

    const newJobId = firstJob.join('-').toLowerCase();
    if (!newJobId) {
      throw new Error('No ID found');
    }
    return checkCurrentFirstJob(newJobId);
  } catch (error) {
    console.error(error);
    throw new Error(error);
  }
}

async function checkCurrentFirstJob (newJobId) {
  try {
    const firebaseData = await readDataFromFirebase(`/${FIREBASE_FIELD}`);
    if (newJobId && newJobId !== firebaseData.val()) {
      await writeDataToFirebase('/', {[FIREBASE_FIELD]: newJobId});
      return sendEmail();
    }
    return 'OLD JOB';
  } catch (error) {
    console.error(error);
    throw new Error(error);
  }
}

async function readDataFromFirebase (path, data) {
  return database.ref(path).once('value');
}

async function writeDataToFirebase (path, data) {
  return database.ref(path).set(data);
}

function sendEmail () {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: passwords.emailUsername,
        pass: passwords.emailPassword
      }
    });

    const mailOptions = {
      from: passwords.fromEmail,
      to: passwords.recipientEmail, 
      subject: 'Nurse Job Alert',
      html: passwords.message.replace('${url}', WEBSITE_TO_SCRAPE_URL)
    };

    return transporter.sendMail(mailOptions);
  } catch (error) {
    console.error(error);
    throw new Error(error);
  }
}
