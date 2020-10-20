const axios = require("axios");
const uuid = require("uuid");
const AWS = require("aws-sdk");
const ddb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

const PAY_PER_RIDE = 13;

exports.handler = async () => {
	const scanParams = {
		TableName: process.env.TABLE_NAME,
		FilterExpression: "#counter > :base",
		ExpressionAttributeNames: { "#counter": "RideCount" },
		ExpressionAttributeValues: { ":base": 0 }
	};

	const scanResult = await ddb.scan(scanParams).promise();

	await Promise.all(scanResult.Items.map(handleItem));
};

async function handleItem(item) {
	await generateSalary(item);
	await decreaseRides(item);
}

async function generateSalary(item) {
	const unicornDetails = await getUnicornDetails(item.Name);
	await s3.putObject({
		Bucket: process.env.BUCKET_NAME,
		Key: `${item.Name}/${uuid.v4()}`,
		Tagging: `email=${unicornDetails.Email}&subject=${item.Name}%20Rides%20Paycheck`,
		Body: (
			`
Paycheck for ${item.Name}
-----------------------------------
Time: ${(new Date()).toISOString()}
Rides: ${item.RideCount}
Total Amount: ${item.RideCount * PAY_PER_RIDE} USD

WildRydes corp.
`
		)
	}).promise();
}

async function decreaseRides(item) {
	const params = {
		TableName: process.env.TABLE_NAME,
		Key: { Name: item.Name },
		UpdateExpression: "ADD #counter :decrement",
		ExpressionAttributeNames: { "#counter": "RideCount" },
		ExpressionAttributeValues: { ":decrement": -(item.RideCount) }
	};

	await ddb.update(params).promise();
}

async function getUnicornDetails(unicornName) {

	if (!("UNICORN_STABLE_API" in process.env)) {
		throw new Error("UNICORN_STABLE_API environment variable is missing");
	}
  
	const resp = await axios.get(`https://${process.env.UNICORN_STABLE_API}/unicorn/${unicornName}`);
	return resp.data;
}
