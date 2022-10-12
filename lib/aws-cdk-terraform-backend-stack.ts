
import { Aws, CfnCondition, CfnParameter, CfnOutput, Fn, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from "constructs";
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';


export class AwsCdkTerraformBackendStack extends Stack {

  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    const ACCOUNT_ID = Aws.ACCOUNT_ID;
    const AWS_REGION = Aws.REGION

    const dynamoDbTableName = new CfnParameter(this, 'dynamoDbTableName', {
      default: 'tf-locktable',
      type: "String",
    })

    const loggingBucketName = new CfnParameter(this, 'loggingBucketName', {
      default: '',
      type: 'String',
    });

    const loggingPrefix = new CfnParameter(this, 'loggingPrefix', {
      default: 'terraform-access',
      type: "String",
    })

    const stateBucketName = new CfnParameter(this, 'stateBucketName', {
      default: '',
      type: "String",
    });

    const loggingBucketNameProvided = new CfnCondition(this, 'loggingBucketNameProvided', {
      expression: Fn.conditionNot(Fn.conditionEquals(loggingBucketName.valueAsString, '')),
    });

    const stateBucketNameProvided = new CfnCondition(this, 'stateBucketNameProvided', {
      expression: Fn.conditionNot(Fn.conditionEquals(stateBucketName.valueAsString, '')),
    });

    const kmsKeyPolicy = new iam.PolicyDocument({
      statements: [new iam.PolicyStatement({
        actions: [
          'kms:*',
        ],
        principals: [new iam.AccountRootPrincipal()],
        resources: ['*'],
      }),],
    });

    const kmsKey = new kms.Key(this, 'KMSKey', {
      description: "S3 KMS key for tfstate",
      policy: kmsKeyPolicy,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const loggingBucket = new s3.Bucket(this, 'LoggingBucket', {
      accessControl: s3.BucketAccessControl.LOG_DELIVERY_WRITE,
      bucketName: Fn.conditionIf(loggingBucketNameProvided.logicalId, loggingBucketName.valueAsString, `${Aws.ACCOUNT_ID}-${Aws.REGION}-tf-state-logging`).toString(),
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: kmsKey,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const stateBucket = new s3.Bucket(this, 'StateBucket', {
      accessControl: s3.BucketAccessControl.PRIVATE,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      bucketName: Fn.conditionIf(stateBucketNameProvided.logicalId, stateBucketName.valueAsString, `${Aws.ACCOUNT_ID}-${Aws.REGION}-tf-state`).toString(),
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: kmsKey,
      removalPolicy: RemovalPolicy.DESTROY,
      serverAccessLogsBucket: loggingBucket,
      serverAccessLogsPrefix: loggingPrefix.valueAsString,
      versioned: true,
    });

    const dynamoDbTable = new dynamodb.Table(this, 'DynamoDBLockTable', {
      partitionKey: { name: 'LockID', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      tableName: dynamoDbTableName.valueAsString,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    new CfnOutput(this, 'dynamoDbTableNameOutput', {
      value: dynamoDbTable.tableName.toString(),
    });

    new CfnOutput(this, 'stateBucketNameOutput', {
      value: stateBucket.bucketName.toString(),
    });
  }
}
