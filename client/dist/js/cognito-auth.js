var WildRydes = window.WildRydes || {};

class CognitoDisabledError extends Error {
    constructor(message) {
      super(message);
      this.name = 'CognitoDisabledError';
    }
}

async function register(email, password, onSuccess, onFailure) {
    var attributeEmail = new AmazonCognitoIdentity.CognitoUserAttribute({
        Name: 'email',
        Value: email
    });

    const userPool = await WildRydes.userPool();

    userPool.signUp(toUsername(email), password, [attributeEmail], null,
        function signUpCallback(err, result) {
            if (!err) {
                onSuccess(result);
            } else {
                onFailure(err);
            }
        }
    );
}

function createCognitoUser(userPool, email) {
    return new AmazonCognitoIdentity.CognitoUser({
        Username: toUsername(email),
        Pool: userPool
    });
}

function signin(userPool, email, password, onSuccess, onFailure) {
    var authenticationDetails = new AmazonCognitoIdentity.AuthenticationDetails({
        Username: toUsername(email),
        Password: password
    });    

    var cognitoUser = createCognitoUser(userPool, email);
    cognitoUser.authenticateUser(authenticationDetails, {
        onSuccess: onSuccess,
        onFailure: onFailure
    });    
}    

async function verify(email, code, onSuccess, onFailure) {
    const userPool = await WildRydes.userPool();
    createCognitoUser(userPool, email).confirmRegistration(code, true, function confirmCallback(err, result) {
        if (!err) {
            onSuccess(result);
        } else {
            onFailure(err);
        }
    });
}

function toUsername(email) {
    return email.replace('@', '-at-');
}

async function handleSignin(event) {
    event.preventDefault();

    const userPool = await WildRydes.userPool();

    var email = jQuery('#emailInputSignin').val();
    var password = jQuery('#passwordInputSignin').val();

    signin(userPool, email, password,
        function signinSuccess() {
            console.log('Successfully Logged In');
            window.location.href = 'ride.html';
        },
        function signinError(err) {
            alert(err);
        }
    );
};

function handleRegister(event) {
    var email = jQuery('#emailInputRegister').val();
    var password = jQuery('#passwordInputRegister').val();
    var password2 = jQuery('#password2InputRegister').val();

    var onSuccess = function registerSuccess(result) {
        var cognitoUser = result.user;
        console.log('user name is ' + cognitoUser.getUsername());
        var confirmation = ('Registration successful. Please check your email inbox or spam folder for your verification code.');
        if (confirmation) {
            window.location.href = 'verify.html';
        }
    };
    var onFailure = function registerFailure(err) {
        alert(err);
    };
    event.preventDefault();

    if (password === password2) {
        register(email, password, onSuccess, onFailure);
    } else {
        alert('Passwords do not match');
    }
}

async function handleVerify(event) {
    event.preventDefault();

    const email = jQuery('#emailInputVerify').val();
    const code = jQuery('#codeInputVerify').val();

    await verify(email, code,
        function verifySuccess(result) {
            console.log('call result: ' + result);
            console.log('Successfully verified');
            alert('Verification successful. You will now be redirected to the login page.');
            window.location.href = 'signin.html';
        },
        function verifyError(err) {
            alert(err);
        }
    );
}

WildRydes.config = (async () => fetch('/js/config.json').then((response) => response.json()));

WildRydes.userPool = (async() => {
    const config = await WildRydes.config();

    if (config.cognito.disabled) {
        throw new CognitoDisabledError('Cognito is disabled');
    }

    var poolData = {
        UserPoolId: config.cognito.userPoolId,
        ClientId: config.cognito.userPoolClientId
    };

    if (!(config.cognito.userPoolId &&
          config.cognito.userPoolClientId &&
          config.cognito.region)) {
        jQuery('#noCognitoMessage').show();
        return;
    }

    // TODO remove ugly side effect
    if (typeof AWSCognito !== 'undefined') {
        AWSCognito.config.region = config.cognito.region;
    }

    return new AmazonCognitoIdentity.CognitoUserPool(poolData);
});

WildRydes.authToken = (async () => {
    const userPool = await WildRydes.userPool();

    const cognitoUser = userPool.getCurrentUser();

    return new Promise((resolve, reject) => {
        if (cognitoUser) {
            cognitoUser.getSession(function sessionCallback(err, session) {
                if (err) {
                    reject(err);
                } else if (!session.isValid()) {
                    resolve(null);
                } else {
                    resolve(session.getIdToken().getJwtToken());
                }
            });
        } else {
            reject(new Error('NoCognitoUserFound'));
        }
    });
});
