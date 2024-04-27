import { Construct } from "constructs";
import * as rds from "aws-cdk-lib/aws-rds";
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

    // NOTE: プライマリインスタンスの作成
    const rdsPrimaryInstance = new rds.DatabaseInstance(this, "RdsPrimaryInstance", {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15_5,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO,
      ),
      credentials: rdsCredentials,
      databaseName: "cdk_test_db",
      vpc: props.vpc.value,
      vpcSubnets: props.vpc.getRdsIsolatedSubnets(),
      networkType: rds.NetworkType.IPV4,
      securityGroups: [props.securityGroup],
      availabilityZone: "ap-northeast-1a",
      deleteAutomatedBackups: true,
      autoMinorVersionUpgrade: false,
    });

    // NOTE: リードレプリカの作成
    new rds.DatabaseInstanceReadReplica(this, "RdsReadReplica", {
      sourceDatabaseInstance: rdsPrimaryInstance,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO,
      ),
      vpc: props.vpc.value,
      availabilityZone: "ap-northeast-1c",
      vpcSubnets: props.vpc.getRdsIsolatedSubnets(),
      deleteAutomatedBackups: true,
      autoMinorVersionUpgrade: false,
    });
  }
}
