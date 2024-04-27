import { Construct } from "constructs";
import { Credentials, DatabaseInstance, DatabaseInstanceEngine, DatabaseInstanceReadReplica, NetworkType, PostgresEngineVersion } from "aws-cdk-lib/aws-rds";
import type { SecurityGroup } from "aws-cdk-lib/aws-ec2";
import { InstanceClass, InstanceSize, InstanceType } from "aws-cdk-lib/aws-ec2";
import type { Vpc } from "./vpc";

interface RdsProps {
  vpc: Vpc;
  securityGroup: SecurityGroup;
}

export class Rds extends Construct {
  constructor(scope: Construct, id: string, props: RdsProps) {
    super(scope, id);

    // NOTE: パスワードを自動生成してSecrets Managerに保存
    const rdsCredentials = Credentials.fromGeneratedSecret("cdk_test_user", {
      secretName: "/cdk-test/rds/",
    });

    // NOTE: プライマリインスタンスの作成
    const rdsPrimaryInstance = new DatabaseInstance(this, "RdsPrimaryInstance", {
      engine: DatabaseInstanceEngine.postgres({
        version: PostgresEngineVersion.VER_15_5,
      }),
      instanceType: InstanceType.of(
        InstanceClass.T3,
        InstanceSize.MICRO,
      ),
      credentials: rdsCredentials,
      databaseName: "cdk_test_db",
      vpc: props.vpc.value,
      vpcSubnets: props.vpc.getRdsIsolatedSubnets(),
      networkType: NetworkType.IPV4,
      securityGroups: [props.securityGroup],
      availabilityZone: "ap-northeast-1a",
      deleteAutomatedBackups: true,
      autoMinorVersionUpgrade: false,
    });

    // NOTE: リードレプリカの作成
    new DatabaseInstanceReadReplica(this, "RdsReadReplica", {
      sourceDatabaseInstance: rdsPrimaryInstance,
      instanceType: InstanceType.of(
        InstanceClass.T3,
        InstanceSize.MICRO,
      ),
      vpc: props.vpc.value,
      availabilityZone: "ap-northeast-1c",
      vpcSubnets: props.vpc.getRdsIsolatedSubnets(),
      deleteAutomatedBackups: true,
      autoMinorVersionUpgrade: false,
    });
  }
}
