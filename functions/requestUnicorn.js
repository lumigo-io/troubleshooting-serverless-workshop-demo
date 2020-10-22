const randomBytes = require("crypto").randomBytes;

// Instrument AWS-SDK
const AWSXRay = require("aws-xray-sdk-core");
const AWS = AWSXRay.captureAWS(require("aws-sdk"));
const sns = new AWS.SNS();
const ddb = new AWS.DynamoDB.DocumentClient();

// Instrument HTTP requests
AWSXRay.captureHTTPsGlobal(require("https"));

const axios = require("axios");

const RIDE_LENGTH_SECONDS = 30;
exports.handler = async (event, context) => {
	try {
		if (!event.requestContext.authorizer) {
			return errorResponse("Authorization not configured", context.awsRequestId);
		}

		const rideId = toUrlString(randomBytes(16));
		console.log("Received event (", rideId, "): ", event);

		// Because we're using a Cognito User Pools authorizer, all of the claims
		// included in the authentication token are provided in the request context.
		// This includes the username as well as other attributes.
		const username = event.requestContext.authorizer.claims["cognito:username"];
		const email = event.requestContext.authorizer.claims["email"];

		// The body field of the event in a proxy integration is a raw string.
		// In order to extract meaningful values, we need to first parse this string
		// into an object. A more robust implementation might inspect the Content-Type
		// header first and use a different parsing strategy based on that value.
		const requestBody = JSON.parse(event.body);

		const pickupLocation = requestBody.PickupLocation;

		const rideDetail = await validateUnicornAvailable(await findUnicorn(pickupLocation));

		await publishRide(rideId, username, email, rideDetail);

		// Because this Lambda function is called by an API Gateway proxy integration
		// the result object must use the following structure.
		return {
			statusCode: 201,
			body: JSON.stringify({
				RideId: rideId,
				RideDetail: rideDetail,
				Eta: RIDE_LENGTH_SECONDS + " seconds",
				Rider: username,
			}),
			headers: {
				"Access-Control-Allow-Origin": "*",
			},
		};
	} catch (err) {
		console.error(err);

		// If there is an error during processing, catch it and return
		// from the Lambda function successfully. Specify a 500 HTTP status
		// code and provide an error message in the body. This will provide a
		// more meaningful error response to the end client.
		return errorResponse(err.message, context.awsRequestId);
	};
};

// This is where you would implement logic to find the optimal unicorn for
// this ride (possibly invoking another Lambda function as a microservice.)
// For simplicity, we'll just pick a unicorn at random.
async function findUnicorn(pickupLocation) {
	console.log("Finding unicorn for ", pickupLocation.Latitude, ", ", pickupLocation.Longitude);

	if (!("UNICORN_STABLE_API" in process.env)) {
		throw new Error("UNICORN_STABLE_API environment variable is missing");
	}

	const resp = await axios.get(`https://${process.env.UNICORN_STABLE_API}/unicorn`);
  
	// Instrument HTTP responses
	console.log("found unicorn:", resp.data);
	return resp.data;
}

async function publishRide(rideId, username, email, rideDetail) {
	const requestTime = new Date().toISOString();
	await sns.publish({
		TopicArn: process.env.TOPIC_ARN,
		Message: JSON.stringify({
			RideId: rideId,
			Email: email,
			User: username,
			RequestTime: requestTime,
			RideDetail: rideDetail
		})
	}).promise();
}

async function validateUnicornAvailable(unicorn) {
	let now = new Date();
	let seconds = Math.round(now.getTime() / 1000);
	const getParams = {
		TableName: process.env.TABLE_NAME,
		Key: {
			UnicornName: unicorn.Name,
		}
	};
	try {
		let getResponse = await ddb.get(getParams).promise();
		if (getResponse.Item.Expiration > seconds) {
			return {}; // unicorn is occupied, fail.
		}
	} catch(err) {
		// item doesn't exist, carry on
		console.log("unicorn not occupied");
	}

	const putParams = {
		TableName: process.env.TABLE_NAME,
		Item: {
			UnicornName: unicorn.Name,
			Expiration: seconds + RIDE_LENGTH_SECONDS
		}
	};

	await ddb.put(putParams).promise();
	return {
		Unicorn: unicorn
	};
}

function toUrlString(buffer) {
	return buffer.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=/g, "");
}

function errorResponse(errorMessage, awsRequestId) {
	return {
		statusCode: 500,
		body: JSON.stringify({
			Error: errorMessage,
			Reference: awsRequestId,
		}),
		headers: {
			"Access-Control-Allow-Origin": "*",
		},
	};
}
