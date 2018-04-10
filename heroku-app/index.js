const rp = require('request-promise'),
  cheerio = require('cheerio'),
  express = require('express'),
  app = express(),
  admin = require('firebase-admin'),
  firebaseServiceAccount = require('./hannah-nursing-job-alert-firebase-adminsdk-phu0e-5ef1be0dff.json'),
  nodemailer = require('nodemailer'),
  passwords = require('./passwords');

const WEBSITE_TO_SCRAPE_URL = 'https://www.healthcaresource.com/steward/index.cfm?&template=dsp_job_list%2Ecfm&fuseaction=search%2EjobList&ilocationid=%24all&cjoborderby=&cjobattr1=All&ifacilityid=910098025&ckeywordsearchcategory=cdept%2C%20mdes%2C%20creqnum&ijobcatid=105&cjobattr2=All&iregionid=%24all&ijobrowstart=1&ijobpostondaysold=7&nkeywordsearch=';
const FIREBASE_FIELD = 'nurseJobIds';

admin.initializeApp({
  credential: admin.credential.cert(firebaseServiceAccount),
  databaseURL: passwords.database
});
const database = admin.database();

const port = process.env.PORT || 8080;
console.log(`Express listening... on ${port}`);
app.listen(port);
app.get("/nursing-job-alert", routeRequest);

async function routeRequest (req, res, next) {
  res.setHeader('Content-Type', 'application/json');
  try{
    res.send(JSON.stringify({ status: 'OK', response: await nurseAlert() }));
  } catch (error) {
    console.log(error);
    res.status(500).send({error: error});
  }
}

async function nurseAlert () {
  try {
    console.log('Scraping site...');
    var options = {uri: WEBSITE_TO_SCRAPE_URL, transform: body => cheerio.load(body)};
    const $ = await rp(options);

    const jobs = [];
    $('tbody > tr').slice(1).each((index, el) => {
      const job = $(el).text().replace(/\s/g,'').split('-');
      job[2] = job[2].substr(0, 2);
      jobs.push(job.slice(0, 3).join('-').split('.')[1].toLowerCase());
    });

    return checkStoredJobs(jobs);
  } catch (error) {
    console.error(error);
    throw new Error(error);
  }
}

async function checkStoredJobs (newJobs) {
  try {
    const firebaseData = await readDataFromFirebase(`/${FIREBASE_FIELD}`);
    const storedJobs = firebaseData.val();
    if (newJobs.some(job => !storedJobs || !storedJobs.includes(job))) {
      console.log('NEWJOB');
      await writeDataToFirebase('/', {[FIREBASE_FIELD]: newJobs});
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
