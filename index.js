const express = require('express');
require('dotenv').config();
const { auth, requiresAuth } = require('express-openid-connect');
const { engine } = require('express-handlebars');
const axios = require("axios");
var request = require("request");

const app = express();

const authConfig = {
  authRequired: false,
  auth0Logout: true,
  secret: 'a long, randomly-generated string stored in env',
  baseURL: process.env.BASE_URL,
  clientID: 'tgzMOGnF9aiN3mEJrywMZTQPU2FKPMId',
  issuerBaseURL: 'https://atko-hr.cic-demo-platform.auth0app.com'
};

// auth router attaches /login, /logout, and /callback routes to the baseURL
app.use(
    auth(authConfig),
    express.json(),
    express.urlencoded({
        extended: true
    }),
    (req, res, next) => {
        // console.log(req);
        next();
    }
);

// =========== VIEWS ===========
app.set('view engine', 'hbs');

app.engine('hbs', engine({
    layoutsDir: __dirname + '/views/layouts',
    partialsDir: __dirname + '/views/partials/',
    extname: 'hbs'
}));
// req.isAuthenticated is provided from the auth router
app.get('/', (req, res) => {
  res.send(req.oidc.isAuthenticated() ? 'Logged in' : 'Logged out');
});

// Employee list view
app.get('/employees', requiresAuth(), async (req, res) => {
    await axios.get(process.env.API_URL+'/employees', {
        headers: {
          'apiKey': process.env.APP_API_KEY
        }
    })
        .then(response => {
            res.render('employees', {
                layout: 'index',
                employees: response.data
        })
    })
    .catch(error => {
        console.log(error);
    });
});

// Push new user to Auth0 and render the employee detail page
app.post('/onboard-employee', requiresAuth(), async (req, res) => {
    await axios.post(process.env.API_URL+'/employees', {
        'firstName': req.body.inputFirstName,
        'lastName': req.body.inputLastName,
        'position': req.body.inputPosition,
        'startDate': req.body.inputYear +"/" +req.body.inputMonth +"/" +req.body.inputDay
    }).then(response => {
        res.redirect('/employees/'+response.data);
    }).catch(error => {
        res.render('error', {
            layout: 'index',
            notification: "Something went wrong",
            error: 'Ooops! Something went wrong: ' +error.response.data
        });
    });
});

// Get the user via ID from the API
app.get('/employees/:id', requiresAuth(), async (req, res) => {
    await axios.get(process.env.API_URL+'/employees/'+req.params.id)
    .then(response => {
        res.render('employeeDetail', {
            layout: 'index',
            notification: "",
            employee: response.data
        });
    }).catch(error => {
        console.log(error);
        res.render('error', {
            layout: 'index',
            notification: "Something went wrong",
            error: 'Ooops! Something went wrong: ' +error.response.data
        });
    });
});

// =========== APIs ===========
// get an access token
let option_body = {
    'client_id':process.env.M2M_CLIENT_ID,
    'client_secret':process.env.M2M_SECRET,
    'audience':process.env.ISSUER_BASE_URL+'/api/v2/',
    "grant_type":"client_credentials"
};

var options = { method: 'POST',
    url: process.env.ISSUER_BASE_URL+'/oauth/token',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(option_body) };

request(options, function (error, response, body) {
    if (error) throw new Error(error);
    accessToken = JSON.parse(body).access_token
});

app.get('/api/employees', (req, res) => {
        if (req.headers.apikey == process.env.APP_API_KEY) {
        const getEmployeesList = async() => {
            let employeesList = [];

            await axios.get(process.env.ISSUER_BASE_URL +'/api/v2/users', {
                headers: { "authorization": "Bearer " +accessToken },
            })
            .then((rawEmployeeList) => {
                rawEmployeeList.data.forEach(element => {
                    employeesList.push(
                        {
                            'id': element.user_id,
                            'email' : element.email,
                            'name' : element.name,
                            'hireDate': element.user_metadata.hireDate,
                            'manager': element.user_metadata.manager,
                            'position': element.user_metadata.position,
                            'time': element.user_metadata.time
                        }
                    )
                });
            });
            return employeesList;
        };
        getEmployeesList().then((employeesList) => {
            res.json(employeesList)
        });
    } else {
        res.status(401).send('unauthorized');
    }
});

app.post('/api/employees', async (req, res) => {
    let payload = {
        "email": req.body.firstName +req.body.lastName +"onlinegrape.nl",
        "user_metadata": {
            "hireDate": req.body.startDate,
            "manager": "",
            "position": req.body.position,
            "time": ""
        },
    }
    await axios.post(process.env.ISSUER_BASE_URL +'/api/v2/users', {
        "email": req.body.firstName +req.body.lastName +"@onlinegrape.nl",
        "given_name": req.body.firstName,
        "family_name": req.body.lastName,
        "name": req.body.firstName +' ' +req.body.lastName,
        "user_metadata": {
            "hireDate": req.body.startDate,
            "manager": "",
            "position": req.body.position,
            "time": "Fulltime"
        },
        "connection": "Username-Password-Authentication",
        "password": "GRAPE92P@ss"
      }, {
            headers: { "Authorization": "Bearer " +accessToken },
        }).then((response) => {
            // axios.post('https://onlinegrape.workflows.okta.com/api/flo/983cf56d819db521ac759dfff41a1b64/invoke?clientToken=1ef1cb769b36610ec9da28aeb86d73a111d40a713479678d97c0c1c69f681da5');
            res.send(response.data.user_id)
        }).catch((error) => {
            res.status(error.response.status).send(error.response.data.message);
        })
});

// Get User via ID from Auth0
app.get('/api/employees/:id', async (req, res) => {
    await axios.get(process.env.ISSUER_BASE_URL +'/api/v2/users/' +req.params.id, {
            headers: { "authorization": "Bearer " +accessToken },
    }).then((response) => {
        res.json(response.data)
    }).catch((error) => {
        res.status(error.response.status).send(error.response.data.message);
    })
});

// RUN
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log('App is running !');
});