import { RemovalPolicy } from "aws-cdk-lib";
import type { IConnectable, IVpc } from "aws-cdk-lib/aws-ec2";
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
  NetworkType
} from "aws-cdk-lib/aws-rds";
import { ISecret } from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

import { STACK_AVAILABILITY_ZONES } from "../config";

interface RdsProps {
  /**
   * RDSを作成するVPC
   */
  readonly vpc: IVpc;
  /**
   * データベース名
   * - <database_name>の形式(スネークケース)で指定する
   * @example "cdk_training_taro_yamada"
   */
  readonly databaseName: string;
  /**
   * ユーザ名
   * - <your_name>の形式(スネークケース)で指定する
   * @example "taro_yamada"
   */
  readonly username: string;
}

export class Rds extends Construct {
  /**
   * データベースに接続するためのシークレット情報
   *
   * ※シークレットはECSコンテナの`secrets`プロパティに加工せずに指定可能
   * ```typescript
   * // ECSのタスク定義にコンテナを追加するコードの例
   * taskDefinition.addContainer("EcsContainer", {
   *   secrets: rds.secrets,
   * });
   * ```
   */
  public readonly secrets: { [key: string]: Secret };

  /**
   * 接続可能なRDSのインスタンス
   * - リソースをRDSに接続する際には、このインスタンスを利用して以下のように接続を行う
   * ```typescript
   * // `allowDefaultPortFrom`の引数には接続したいリソースを指定
   * connectableInstance.connections.allowDefaultPortFrom(ecsService);
   * ```
   */
  public readonly connectableInstance: IConnectable;

  constructor(scope: Construct, id: string, props: RdsProps) {
    super(scope, id);

    this.validateDatabaseName(props.databaseName);
    this.validateUsername(props.username);

    // NOTE: パスワードを自動生成してSecrets Managerに保存
    const credentials = Credentials.fromGeneratedSecret(props.username);

    const instance = new DatabaseInstance(this, "MysqlInstance", {
      engine: DatabaseInstanceEngine.mysql({
        version: MysqlEngineVersion.VER_8_0,
      }),
      instanceType: InstanceType.of(InstanceClass.T4G, InstanceSize.MICRO),
      databaseName: props.databaseName,
      vpc: props.vpc,
      vpcSubnets: props.vpc.selectSubnets({
        subnetType: SubnetType.PRIVATE_ISOLATED,
      }),
      networkType: NetworkType.IPV4,
      availabilityZone: STACK_AVAILABILITY_ZONES.TOKYO_A,
      credentials,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // NOTE: IConnectableは`secret`プロパティを持たないので、thisではなく定数の`instance`を利用してシークレットを取得
    const secret = instance.secret;
    if (!secret) throw new Error("RDSのシークレットが取得できませんでした。");

    this.connectableInstance = instance;
    this.secrets = this.getDatabaseSecrets(secret);
  }

  /**
   * RDSのシークレット情報を取得する
   */
  private getDatabaseSecrets(secret: ISecret): { [key: string]: Secret } {
    return {
      DATABASE_ENGINE: Secret.fromSecretsManager(secret, "engine"),
      DATABASE_USERNAME: Secret.fromSecretsManager(secret, "username"),
      DATABASE_PASSWORD: Secret.fromSecretsManager(secret, "password"),
      DATABASE_HOST: Secret.fromSecretsManager(secret, "host"),
      DATABASE_PORT: Secret.fromSecretsManager(secret, "port"),
      DATABASE_NAME: Secret.fromSecretsManager(secret, "dbname"),
    };
  }

  /**
   * データベース名が<database_name>の形式(スネークケース)であることを確認する
   */
  private validateDatabaseName(databaseName: string): void {
    if (!this.isSnakeCase(databaseName)) {
      throw new Error("データベース名はスネークケースで指定してください。");
    }
  }

  /**
   * ユーザー名が`<your_name>`の形式(スネークケース)であることを確認する
   */
  private validateUsername(username: string): void {
    if (!this.isSnakeCase(username)) {
      throw new Error("ユーザー名はスネークケースで指定してください。");
    }
  }

  /**
   * スネークケースかどうかを判定
   */
  private isSnakeCase(str: string): boolean {
    const snakeCasePattern = /^[a-z]+(_[a-z]+)*$/;
    return snakeCasePattern.test(str);
  }
}
