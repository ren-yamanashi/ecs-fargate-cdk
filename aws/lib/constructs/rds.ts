import type { ISecurityGroup, IVpc } from "aws-cdk-lib/aws-ec2";
import {
  InstanceClass,
  InstanceSize,
  InstanceType,
  SubnetType,
} from "aws-cdk-lib/aws-ec2";
import { Secret } from "aws-cdk-lib/aws-ecs";
import {
  Credentials,
  DatabaseInstance,
  DatabaseInstanceEngine,
  MysqlEngineVersion,
  NetworkType,
} from "aws-cdk-lib/aws-rds";
import { Construct } from "constructs";

interface RdsProps {
  /**
   * RDSを作成するVPC
   */
  vpc: IVpc;
  /**
   * RDSに関連付けるセキュリティグループ
   */
  securityGroup: ISecurityGroup;
  /**
   * データベース名
   */
  databaseName: string;
  /**
   * ユーザ名
   */
  username: string;
}

export interface RdsSecrets {
  engine: Secret;
  username: Secret;
  password: Secret;
  dbname: Secret;
  port: Secret;
  host: Secret;
}

export class Rds extends Construct {
  private readonly instance: DatabaseInstance;

  constructor(scope: Construct, id: string, props: RdsProps) {
    super(scope, id);

    // NOTE: パスワードを自動生成してSecrets Managerに保存
    const rdsCredentials = Credentials.fromGeneratedSecret(props.username);

    this.instance = new DatabaseInstance(this, "MySqlInstance", {
      engine: DatabaseInstanceEngine.mysql({
        version: MysqlEngineVersion.VER_8_0,
      }),
      instanceType: InstanceType.of(InstanceClass.T4G, InstanceSize.MICRO),
      credentials: rdsCredentials,
      databaseName: props.databaseName,
      vpc: props.vpc,
      vpcSubnets: props.vpc.selectSubnets({
        subnetType: SubnetType.PRIVATE_ISOLATED,
        availabilityZones: ["ap-northeast-1a"],
      }),
      networkType: NetworkType.IPV4,
      securityGroups: [props.securityGroup],
      availabilityZone: "ap-northeast-1a",
    });
  }

  /**
   * データベースに接続するためのシークレットを取得
   *
   * ※取得したシークレットは`ecs.Secret`型のため、ECSコンテナの`secrets`プロパティに加工せずに指定可能
   * ```typescript
   * // ECSのタスク定義にコンテナを追加するコードの例
   * taskDefinition.addContainer("EcsContainer", {
   *   // 他のプロパティは省略
   *   secrets: {
   *     engine: databaseSecrets.engine,
   *     username: databaseSecrets.username,
   *     password: databaseSecrets.password,
   *     dbname: databaseSecrets.dbname,
   *     port: databaseSecrets.port,
   *     host: databaseSecrets.host,
   *   },
   * });
   * ```
   */
  public getDatabaseSecrets(): RdsSecrets {
    const secret = this.instance.secret;
    if (!secret) throw new Error("Rds secret not found.");
    return {
      engine: Secret.fromSecretsManager(secret, "engine"),
      username: Secret.fromSecretsManager(secret, "username"),
      password: Secret.fromSecretsManager(secret, "password"),
      host: Secret.fromSecretsManager(secret, "host"),
      port: Secret.fromSecretsManager(secret, "port"),
      dbname: Secret.fromSecretsManager(secret, "dbname"),
    };
  }

  private validateDatabaseName(databaseName: string): void {
    if (!databaseName.startsWith("cdk_training_")) {
      throw new Error(
        '"cdk_training_"で始まるデータベース名を指定してください。'
      );
    }
  }
}
