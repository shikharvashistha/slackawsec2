#!/usr/bin/env node
const { argv } = require('yargs')
    .option('secret_key', {
        type: 'string',
        description: 'AWS Secret Key',
    })
    .option('access_key', {
        type: 'string',
        description: 'AWS Access Key',
    })
    .option('region', {
        type: 'string',
        default: 'ap-northeast-1',
        description: 'AWS Region',
    })
    .option('slack_webhook', {
        type: 'string',
        description: 'Slack webhook URL'
    })
    .option('subject', {
        type: 'string',
        default: '',
        description: 'Slack subject'
    })
    .option('slack_url', {
        type: 'string',
        description: 'Slack webhook URL'
    })

const ACCESS_KEY = argv['access_key']
const SECRET_KEY = argv['secret_key']
const REGION = argv['region'] || os.environ['AWS_REGION']
const SLACK_WEBHOOK = argv['slack_webhook']
const SLACK_SUBJECT = "These instances in region " + REGION + " will be stopped in next 30 minutes"

var $http = require("request");
var aws = require('aws-sdk');

async function asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array);
    }
}

var getInstances = function (accesskey, secretkey, region) {
    return new Promise((resolve, reject) => {
        aws.config.update({
            accessKeyId: accesskey,
            secretAccessKey: secretkey,
            region: region
        });
        var ec2 = new aws.EC2();
        var params = {
            Filters: [
                {
                    Name: 'instance-state-name',
                    Values: [
                        'running',
                    ]
                },
            ],
        };
        ec2.describeInstances(params, function (err, data) {
            if (err) {
                reject(err)
            } else {
                let instances = []
                data.Reservations.forEach((reservation) => {
                    reservation.Instances.forEach((instance) => {
                        instances.push({
                            name: instance.Tags.find((tag) => tag.Key == "Name").Value,
                            id: instance.InstanceId
                        })
                    })
                })
                resolve(instances)
            }
        });
    })
}

var notifySlack = function (webhook, subject, instanceName) {
    return new Promise((resolve, reject) => {
        var message = {
            "text": subject,
            "attachments": [
                {
                    "text": instanceName,
                }
            ]
        }
        $http({
            url: webhook,
            method: "POST",
            json: true,
            body: message
        }, function (error, response, body) {
            if (error) {
                reject(error)
            } else {
                resolve(body)
            }
        }
        );
    })
}

async function handleCallback(callback) {
    if (callback.actions[0].name == "stop") {
        await stopInstance(callback.actions[0].value)
    }
}

async function stopInstance(instanceId) {
    return new Promise((resolve, reject) => {
        var ec2 = new aws.EC2();
        var params = {
            InstanceIds: [instanceId]
        };
        ec2.stopInstances(params, function (err, data) {
            if (err) {
                reject(err)
            } else {
                resolve(data)
            }
        });
    })
}


async function run() {
    let instances = await getInstances(ACCESS_KEY, SECRET_KEY, REGION)

    await asyncForEach(instances, async (instance) => {
        console.log(`Notifying ${instance.name} with id ${instance.id}`)
        await notifySlack(SLACK_WEBHOOK, SLACK_SUBJECT, instance.name)
    })

}
run().catch((e) => {
    console.log("Error occurred!\n\n", e)
    process.exit(1)
})