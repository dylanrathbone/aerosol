/*
 * Lists EC2 instances for a provided region. 
 * Only those instances which are running and
 * are tagged with 'ClusterNodeGroup' are returned
 */
const mustache = require('mustache')
const emoji = require('node-emoji');
const figlet = require('figlet');
const chalk = require('chalk');
const AWS = require("aws-sdk");
const inquirer = require('inquirer');
const _ = require('lodash');
const fuzzy = require('fuzzy');
const ora = require('ora');
const spinner = ora();
const fetch = require('node-fetch');

const azs = [];
let availableStacks = [];
const awsDetails = {}

const regions = [
    'us-east-1',
    'us-east-2',
    'us-west-1',
    'us-west-2',
    'ap-south-1',
    'ca-central-1',
    'ap-northeast-1',
    'ap-southeast-2',
    'ap-southeast-1',
    'ap-northeast-2',
    'eu-central-1',
    'sa-east-1',
    'eu-west-1',
    'eu-west-2',
    'eu-west-3',
]

const SSM_START_SESSION = 'ssm start-session';
const CREATE_STACK = 'create stack';
const DELETE_CFN_STACK = 'delete stack';
const STACK_STATUS = 'stack status';

const awsActions = [SSM_START_SESSION, CREATE_STACK, STACK_STATUS, DELETE_CFN_STACK]
const stackTypes = ['Jira', 'Bitbucket', 'Confluence', 'Crowd']

const asiParams = new Map([
    ['Jira', require('./assets/asiParams').jiraAsiParams],
    ['Confluence', require('./assets/asiParams').confluenceAsiParams], 
    ['Bitbucket', require('./assets/asiParams').bitbucketAsiParams],
    ['Crowd', require('./assets/asiParams').jiraAsiParams], 
])

const productParams = new Map([
    ['Jira', require('./assets/productParams').jiraProductParams],
    ['Confluence', require('./assets/productParams').confluenceProductParams],
    ['Bitbucket', require('./assets/productParams').bitbucketProductParams],
    ['Crowd', require('./assets/productParams').jiraProductParams]
])

const asiTemplates = new Map([
    ['Jira', 'https://aws-quickstart.s3.amazonaws.com/quickstart-atlassian-jira/templates/quickstart-jira-dc-with-vpc.template.yaml'],
    ['Confluence', 'https://aws-quickstart.s3.amazonaws.com/quickstart-atlassian-confluence/templates/quickstart-confluence-master-with-vpc.template.yaml'],
    ['Bitbucket', 'https://aws-quickstart.s3.amazonaws.com/quickstart-atlassian-bitbucket/templates/quickstart-bitbucket-dc-with-vpc.template.yaml'],
    ['Crowd', 'https://aws-quickstart.s3.amazonaws.com/quickstart-atlassian-crowd/templates/quickstart-crowd-dc-with-vpc.template.yaml'],
]);

const productTemplates = new Map([
    ['Jira', 'https://aws-quickstart.s3.amazonaws.com/quickstart-atlassian-jira/templates/quickstart-jira-dc.template.yaml'],
    ['Confluence', 'https://aws-quickstart.s3.amazonaws.com/quickstart-atlassian-confluence/templates/quickstart-confluence-master.template.yaml'],
    ['Bitbucket', 'https://aws-quickstart.s3.amazonaws.com/quickstart-atlassian-bitbucket/templates/quickstart-bitbucket-dc.template.yaml'],
    ['Crowd', 'https://aws-quickstart.s3.amazonaws.com/quickstart-atlassian-crowd/templates/quickstart-crowd-dc.template.yaml'],
])

const productPrefixes = new Map([
    ['Jira', 'quickstart-atlassian-jira/'],
    ['Confluence', 'quickstart-atlassian-confluence/'],
    ['Bitbucket', 'quickstart-atlassian-bitbucket/'],
    ['Crowd', 'quickstart-atlassian-crowd/'],
])

figlet.text('Aerosol', {
    font: 'block',
    horizontalLayout: 'default',
    verticalLayout: 'default',
    width: 100,
    whitespaceBreak: true
}, function (err, data) {
    if (err) {
        console.log('Something went wrong...');
        console.dir(err);
        return;
    }
    console.log(chalk.yellow(`${data}`));
    console.log(chalk.yellow(`\t\t\t\t\t CloudFormation in a can `))
    console.log(chalk.yellow(`\t\t\t\t\t\t\   version 1.0.0`))
    // console.log(chalk.yellow(`\t\t\t\t\t\t\       ${sparkles}${sparkles}${sparkles}`))
    console.log('\n')
    inquirer.registerPrompt('autocomplete', require('inquirer-autocomplete-prompt'));
    inquirer
        .prompt([
            {
                type: 'autocomplete',
                name: 'region',
                message: `${emoji.get('earth_africa')} Select a region:`,
                pageSize: 6,
                source: searchRegions
            },
            {
                type: 'rawlist',
                name: 'action',
                message: `${emoji.get('zap')} Select an action:`,
                choices: awsActions
            },
        ])
        .then((answers) => {
            awsDetails.region = answers.region;
            awsDetails.action = answers.action;
            AWS.config.update({region: awsDetails.region});
            AWS.config.getCredentials(function (err) {
                if (err) console.log(chalk.red(`Could not obtain AWS credentials`), err);
                else {
                    switch (awsDetails.action) {
                        case SSM_START_SESSION:
                            ssmSession();
                            break;
                        case CREATE_STACK:
                            createStack();
                            break;
                        case STACK_STATUS:
                            stackStatus();
                            break;
                        case DELETE_CFN_STACK:
                            deleteStack();
                            break;
                        default:
                            console.log(`More to come.`)
                    }
                }
            });
        })
});

/*
 * Retrieve basic params and build. Many params 
 * are defaulted. For now the ExportPrefix is 
 * always defaulted to `ATL-`
 */
async function createStack() {
    const stackProtection = ['Termination protection', 'Shutdown protection']
    loadAvailabilityZones()
    const localCidrBlock = await getPublicIpCidr();
    console.log(chalk.blue(`${emoji.get('information_source')}  CIDR for your IP is: ${localCidrBlock}`))
    inquirer
        .prompt([
            {
                type: 'list',
                name: 'productStack',
                message: `${emoji.get('one')}  Select product:`,
                choices: stackTypes
            },
            {
                type: 'list',
                name: 'deploymentType',
                message: `${emoji.get('two')}  Select a deployment type:`,
                choices: ['Deploy into a new ASI', 'Deploy into an existing ASI']
            },
            {
                type: 'input',
                name: 'stackName',
                message: `${emoji.get('three')}  Provide a stack name:`,
            },
            {
                type: 'confirm',
                name: 'quickDeploy',
                message: `${emoji.get('four')}  Quick deploy? (we default to the optimum params):`,
            },
            {
                type: 'password',
                name: 'dbPassword',
                mask: true,
                message: `${emoji.get('five')}  Provide a DB password (used for user & admin):`,
                when: function (answers) {
                    return !answers.quickDeploy;
                },
            },
            {
                type: 'confirm',
                name: 'multiAzDB',
                message: `${emoji.get('six')}  Multi AZ DB deployment?:`,
                when: function (answers) {
                    return !answers.quickDeploy;
                },
            },
            {
                type: 'checkbox',
                checked: true,
                name: 'availabilityZones',
                message: `${emoji.get('seven')}  Select at least two AZ's:`,
                choices: azs,
                when: function (answers) {
                    return answers.deploymentType === 'Deploy into a new ASI' && !answers.quickDeploy;
                },
            },
            {
                type: 'confirm',
                name: 'enableStackProtection',
                message: `${emoji.get('eight')}  Prevent stack termination or shutdown?:`,
                when: function (answers) {
                    return !answers.quickDeploy;
                },
            },
            {
                type: 'input',
                name: 'accessCidrBlock',
                message: `${emoji.get('nine')}  What is the CIDR block to allow access (your IP == ${localCidrBlock})"`,
                when: function (answers) {
                    return !answers.quickDeploy;
                },
            },
            {
                type: 'checkbox',
                checked: true,
                name: 'stackProtection',
                message: `${emoji.get('keycap_ten')} Select the protection levels:`,
                choices: stackProtection,
                when: function (answers) {
                    return answers.enableStackProtection;
                },
            },
        ])
        .then((answers) => {
            
            /*
             * Apply default values for Quick Deploy
             */
            if (answers.quickDeploy) {
                answers.dbPassword = 'f925dO1ry_'
                answers.multiAzDB = false
                answers.availabilityZones = [azs[0], azs[1]]
                answers.productPrefix = productPrefixes.get(answers.productStack)
                answers.accessCidrBlock = localCidrBlock
            }
            answers.productPrefix = productPrefixes.get(answers.productStack)

            /*
             * Default stack protection to false
             */
            answers.terminationProtection = false;
            answers.applyAntiShutDownTags = false;
            if (answers.stackProtection && answers.stackProtection.length > 0) {
                answers.stackProtection.forEach(protectionType => {
                    if (protectionType === 'Termination protection') answers.terminationProtection = true
                    if (protectionType === 'Shutdown protection') answers.applyAntiShutDownTags = true
                })
            }
            const cloudformation = new AWS.CloudFormation();
            const params = {
                StackName: `${answers.stackName}`,
                Capabilities: [
                    'CAPABILITY_IAM'
                ],
                DisableRollback: true,
                EnableTerminationProtection: answers.terminationProtection,
                Parameters: JSON.parse(mustache.render(answers.deploymentType === 'Deploy into a new ASI'
                    ? asiParams.get(answers.productStack)
                    : productParams.get(answers.productStack), answers)),
                TemplateURL: answers.deploymentType === 'Deploy into a new ASI'
                    ? asiTemplates.get(answers.productStack)
                    : productTemplates.get(answers.productStack),
                Tags: [
                    {
                        "Key": "Name",
                        "Value": `${answers.productStack}-aerosol-deployment`
                    },
                    {
                        "Key": "business_unit",
                        "Value": 'Engineering-Server'
                    },
                    {
                        "Key": "service_name",
                        "Value": `${answers.productStack}`
                    },
                    {
                        "Key": "resource_owner",
                        "Value": process.env.USER
                    }
                ]
            };
            cloudformation.createStack(params, function (err, data) {
                if (err) handlerError(err)
                else {
                    console.log(chalk.green(`${emoji.get('rocket')} Preparing for deployment...`))
                    let stackUrl = `https://${awsDetails.region}.console.aws.amazon.com/cloudformation/home?region=${awsDetails.region}#/stacks/stackinfo?filteringText=&filteringStatus=active&viewNested=false&hideStacks=false&stackId=${data.StackId}`
                    console.log(chalk.green(`${emoji.get('pancakes')} View stack from AWS console:`), stackUrl);
                    getStackStatus(answers)
                }
            });
        })
}

function stackStatus() {
    availableStacks = [];
    /* 
     * For now only interested in the following states
     */
    const listStackParams = {
        StackStatusFilter: [
            'CREATE_IN_PROGRESS',
            'CREATE_FAILED',
            'CREATE_COMPLETE',
            'ROLLBACK_IN_PROGRESS',
            'ROLLBACK_FAILED',
            'ROLLBACK_COMPLETE',
            'DELETE_IN_PROGRESS',
            'DELETE_FAILED',
            'UPDATE_COMPLETE',
            'DELETE_COMPLETE',
            'UPDATE_IN_PROGRESS',
            'UPDATE_COMPLETE_CLEANUP_IN_PROGRESS',
            'UPDATE_COMPLETE',
            'UPDATE_ROLLBACK_COMPLETE'
        ]
    };
    const cloudformation = new AWS.CloudFormation();
    cloudformation.listStacks(listStackParams, function (err, data) {
        availableStacks = [];
        if (err) handlerError(err);
        else {
            data.StackSummaries.forEach(stack => {
                availableStacks.push(stack.StackName);
            })
            if (availableStacks.length === 0) {
                console.log(chalk.green(`${emoji.get('see_no_evil')} No active stacks for region ${awsDetails.region}`))
                process.exit()
            }
            inquirer.registerPrompt('autocomplete', require('inquirer-autocomplete-prompt'));
            inquirer
                .prompt([
                    {
                        type: 'autocomplete',
                        name: 'stackName',
                        message: `${emoji.get('pancakes')} Select a stack:`,
                        pageSize: 20,
                        source: searchStacks
                    }
                ])
                .then((answer) => {
                    getStackStatus(answer);
                })
        }
    });
}

function ssmSession() {
    const ec2 = new AWS.EC2();
    const params = {
        //Filter instances belonging to an AWS QS Stack i.e only those 
        //belonging to ClusterNodeGroup
        Filters: [
            {
                Name: "tag:aws:cloudformation:logical-id",
                Values: [
                    "ClusterNodeGroup"
                ]
            }
        ]
    };
    ec2.describeInstances(params, function (err, data) {
        let availableInstances = [];
        let targetInstances = [];
        if (err) handlerError(err)
        else {
            data.Reservations.forEach(reservation => {
                targetInstances.push(reservation.Instances.filter(instance => instance.State.Name === 'running'))
            });
            targetInstances.forEach((instance, index) => {
                if (instance.length > 0) {
                    let capturedInstance = {};
                    capturedInstance.instanceId = instance[0].InstanceId
                    capturedInstance.name = `Node ${index}: ${instance[0].Tags.filter(tag => tag.Key === 'Name')[0].Value}`;
                    availableInstances.push(capturedInstance)
                }
            })
        }
        if (availableInstances.length > 0) {
            inquirer
                .prompt([
                    {
                        type: 'list',
                        name: 'ec2Instance',
                        message: `${emoji.get('computer')} Select an EC2 instance:`,
                        choices: availableInstances
                    },
                ])
                .then((answers) => {
                    let instanceId = availableInstances.filter(instance => instance.name === answers.ec2Instance)[0].instanceId
                    const sessionCommand = `aws ssm start-session --target ${instanceId} --region ${awsDetails.region}`
                    console.log(chalk.green(`${emoji.get('zap')} Using session details: ${sessionCommand}`))
                    console.log(chalk.green(`${emoji.get('rocket')} Launching SSM session now... `));
                    const spawnSync = require('child_process').spawnSync;
                    spawnSync('aws', ['ssm', 'start-session', "--target", instanceId, "--region", awsDetails.region], {stdio: 'inherit', shell: true});
                })
        } else {
            console.log(chalk.yellow(`${emoji.get('see_no_evil')} No running EC2 instances found for ${awsDetails.region}`))
        }
    })
}

function deleteStack() {
    const deleteStackParams = {
        StackStatusFilter: [
            'CREATE_COMPLETE',
            'ROLLBACK_COMPLETE',
            'UPDATE_COMPLETE',
            'UPDATE_COMPLETE',
            'UPDATE_ROLLBACK_COMPLETE'
        ]
    };
    const cloudformation = new AWS.CloudFormation();
    cloudformation.listStacks(deleteStackParams, function (err, data) {
        availableStacks = [];
        if (err) handlerError(err);
        else {
            data.StackSummaries.forEach(stack => {
                availableStacks.push(stack.StackName);
            })
            if (availableStacks.length === 0) {
                console.log(chalk.green(`${emoji.get('see_no_evil')} No active stacks for region ${awsDetails.region}`))
                process.exit()
            }
            inquirer.registerPrompt('autocomplete', require('inquirer-autocomplete-prompt'));
            inquirer
                .prompt([
                    {
                        type: 'autocomplete',
                        name: 'stackName',
                        message: `${emoji.get('pancakes')} Select a stack to delete:`,
                        pageSize: 20,
                        source: searchStacks
                    },
                    {
                        type: 'confirm',
                        name: 'confirmStackDeletion',
                        message: `${emoji.get('warning')}  Are you sure you want to delete this stack?`,
                    }
                ])
                .then((answers) => {
                    if (answers.confirmStackDeletion) {
                        const params = {
                            StackName: `${answers.stackName}`
                        };
                        cloudformation.deleteStack(params, function (err, data) {
                            if (err) handlerError(err)
                            else {
                                console.log(chalk.green(`Preparing to delete stack [${answers.stackName}] now...`))
                                getStackStatus(answers)
                            }
                        });
                    } else {
                        console.log(chalk.green(`Stack deletion for [${answers.stackName}] cancelled.`))
                        process.exit()
                    }
                })
        }
    });
}

function handlerError(err) {
    switch (err.code) {
        case 'RequestExpired':
            console.log(chalk.red(`${emoji.get('key')} Your AWS credentials have expired. Authenticate to AWS using your favoured mechanism and update ~/.aws/credentials accordingly`));
            process.exit()
            break;
        case 'ExpiredToken':
            console.log(chalk.red(`${emoji.get('key')} Your security token has expired. Authenticate to AWS using your favoured mechanism and update ~/.aws/credentials accordingly`));
            process.exit()
            break;
        case 'ValidationError':
            console.log(chalk.red(`${emoji.get('warning')}  ${err.message}`));
            process.exit()
            break;
        case 'AlreadyExistsException':
            console.log(chalk.red(`${emoji.get('hear_no_evil')} ${err.message}!`));
            process.exit()
            break;
        default:
            console.log(`${emoji.get('thinking_face')} Not sure how to deal with this error: ${err}`)
    }
}

function getStackStatus(answer) {
    const cloudformation = new AWS.CloudFormation();
    const params = {
        StackName: `${answer.stackName}`
    };
    setInterval(() => cloudformation.describeStacks(params, function (err, data) {
        if (err) {
            handlerError(err);
        } else {
            switch (data.Stacks[0].StackStatus) {
                case 'CREATE_COMPLETE':
                    console.log(chalk.green(`\n  ${emoji.get('white_check_mark')} creation complete for stack: ${answer.stackName} `));
                    process.exit()
                    break;
                case 'DELETE_COMPLETE':
                    console.log(data.Stacks[0])
                    console.log(chalk.green(`\n  ${emoji.get('white_check_mark')} deletion complete for stack: ${answer.stackName} `));
                    process.exit()
                    break;
                case 'CREATE_FAILED':
                    console.log(chalk.red(`\n${emoji.get('see_no_evil')} stack creation failed for: ${answer.stackName}. Check AWS Console for more details`));
                    process.exit()
                    break;
                case 'CREATE_IN_PROGRESS':
                    setTimeout(() => {
                        spinner.start();
                        spinner.color = 'yellow';
                        spinner.text = chalk.green(`${emoji.get('construction')} Stack [${answer.stackName}] creation in progress...`);
                    }, 1000);
                    break;
                case 'DELETE_IN_PROGRESS':
                    setTimeout(() => {
                        spinner.start();
                        spinner.color = 'yellow';
                        spinner.text = chalk.green(`${emoji.get('skull_and_crossbones')}  Stack [${answer.stackName}] deletion in progress...`);
                    }, 1000);
                    break;
                default:
                    console.log(chalk.red(`${emoji.get('thinking_face')} not sure what the current status is for: ${answer.stackName}`));
                    process.exit()
                    break;
            }

        }
    }), 5000);
}

function searchRegions(answers, input) {
    input = input || '';
    return new Promise(function (resolve) {
        setTimeout(function () {
            var fuzzyResult = fuzzy.filter(input, regions);
            resolve(
                fuzzyResult.map(function (el) {
                    return el.original;
                })
            );
        }, _.random(30, 500));
    });
}

function searchStacks(answers, input) {
    input = input || '';
    return new Promise(function (resolve) {
        setTimeout(function () {
            var fuzzyResult = fuzzy.filter(input, availableStacks);
            resolve(
                fuzzyResult.map(function (el) {
                    return el.original;
                })
            );
        }, _.random(30, 500));
    });
}

function loadAvailabilityZones() {
    const ec2 = new AWS.EC2();
    ec2.describeAvailabilityZones(function (err, data) {
        if (err) console.log(err, err.stack);
        else data.AvailabilityZones.forEach(zone => {
            azs.push(zone.ZoneName)
        });
    });
}

/**
 * Returns public IP that is used to secure the created stack
 */
async function getPublicIpCidr() {
    const url = 'https://api.ipify.org?format=json';
    return await fetch(url)
        .then(res => res.json())
        .then(body => `${body.ip}/32`)
}