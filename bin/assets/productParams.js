const jiraProductParams = `[
    {
        "ParameterKey": "InternetFacingLoadBalancer",
        "ParameterValue": "true"
    },
    {
        "ParameterKey": "DBMasterUserPassword",
        "ParameterValue": "{{dbPassword}}"
    },
    {
        "ParameterKey": "DBMultiAZ",
        "ParameterValue": "{{multiAzDB}}"
    },
    {
        "ParameterKey": "DBPassword",
        "ParameterValue": "{{dbPassword}}"
    },
    {
        "ParameterKey": "DBStorage",
        "ParameterValue": "100"
    },
    {
        "ParameterKey": "DBStorageType",
        "ParameterValue": "Provisioned IOPS"
    },
    {
        "ParameterKey": "CidrBlock",
        "ParameterValue": "{{&accessCidrBlock}}"
    },
    {
        "ParameterKey": "QSS3BucketName",
        "ParameterValue": "aws-quickstart"
    },
    {
        "ParameterKey": "QSS3KeyPrefix",
        "ParameterValue": "{{&productPrefix}}"
    },
    {
        "ParameterKey": "ClusterNodeInstanceType",
        "ParameterValue": "t3.medium"
    },
    {
        "ParameterKey": "DBInstanceClass",
        "ParameterValue": "db.t3.medium"
    }
]`

const confluenceProductParams = `[
  {
    "ParameterKey": "DBMasterUserPassword",
    "ParameterValue": "{{dbPassword}}"
  },
  {
    "ParameterKey": "DBMultiAZ",
    "ParameterValue": "{{multiAzDB}}"
  },
  {
    "ParameterKey": "DBPassword",
    "ParameterValue": "{{dbPassword}}"
  },
  {
    "ParameterKey": "DBStorage",
    "ParameterValue": "100"
  },
  {
    "ParameterKey": "DBStorageType",
    "ParameterValue": "Provisioned IOPS"
  },
  {
    "ParameterKey": "CidrBlock",
    "ParameterValue": "{{&accessCidrBlock}}"
  },
  {
    "ParameterKey": "QSS3BucketName",
    "ParameterValue": "aws-quickstart"
  },
  {
    "ParameterKey": "QSS3KeyPrefix",
    "ParameterValue": "{{&productPrefix}}"
  }
]`

const bitbucketProductParams = `[
    {
      "ParameterKey": "DBMultiAZ",
      "ParameterValue": "{{multiAzDB}}"
    },
    {
      "ParameterKey": "DBMasterUserPassword",
      "ParameterValue": "{{dbPassword}}"
    },
    {
      "ParameterKey": "BitbucketAdminPassword",
      "ParameterValue": ""
    },
    {
      "ParameterKey": "CidrBlock",
      "ParameterValue": "{{&accessCidrBlock}}"
    },
    {
      "ParameterKey": "DBPassword",
      "ParameterValue": "{{dbPassword}}"
    },
    {
      "ParameterKey": "ClusterNodeInstanceType",
      "ParameterValue": "t3.medium"
    },
    {
      "ParameterKey": "DBInstanceClass",
      "ParameterValue": "db.t3.medium"
    },
    {
      "ParameterKey": "QSS3BucketName",
      "ParameterValue": "aws-quickstart"
    },
    {
      "ParameterKey": "QSS3KeyPrefix",
      "ParameterValue": "{{&productPrefix}}"
    }
]`

exports.jiraProductParams = jiraProductParams;
exports.confluenceProductParams = confluenceProductParams;
exports.bitbucketProductParams = bitbucketProductParams;
