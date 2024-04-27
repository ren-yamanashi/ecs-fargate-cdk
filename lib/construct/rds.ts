import { Construct } from "constructs";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import type { Vpc } from "./vpc";

interface RdsProps {
  vpc: Vpc;
  securityGroup: ec2.SecurityGroup;
}

export class Rds extends Construct {
  constructor(scope: Construct, id: string, props: RdsProps) {
    super(scope, id);

    // NOTE: パスワードを自動生成してSecrets Managerに保存
    const rdsCredentials = rds.Credentials.fromGeneratedSecret("cdk_test_user", {
      secretName: "/cdk-test/rds/",
    });

    new rds.DatabaseCluster(this, "RdsCluster", {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_15_5,
      }),
      writer: rds.ClusterInstance.provisioned("Instance1", {
        instanceType: ec2.InstanceType.of(
          ec2.InstanceClass.T3,
          ec2.InstanceSize.MEDIUM,
        ),
        publiclyAccessible: false,
        instanceIdentifier: "db-instance1",
      }),
      credentials: rdsCredentials,
      defaultDatabaseName: "cdk_test_db",
      vpc: props.vpc.value,
      vpcSubnets: props.vpc.getRdsIsolatedSubnets(),
      networkType: rds.NetworkType.IPV4,
      securityGroups: [props.securityGroup],
    });
  }
}
