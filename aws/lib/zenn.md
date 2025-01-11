## 1. 記事の概要

この記事では、AWS 初心者の私が CDK を触ってみて、どういうふうにリソースやネットワークの構成を考えながら ECS(Fargate) + RDS を構築したかを記します。

### 1.1. 目標

本記事の主な目標は、AWS CDK を使用して ECS(Fargate)と RDS の基本的な構成を理解し、実際に構築する技術を身につけることです。  
以下に示すアーキテクチャ図の環境を実際に構築することで、IaC の基礎と開発の流れを体験し、CDK 開発への一歩を踏み出すことを目指しています。

### 1.2. 構成図

今回構築する環境は以下のようになっております。
![aws-architecture-diagram.png](https://storage.googleapis.com/zenn-user-upload/cd2474a087ba-20250111.png)

ECS は Web アプリケーションサーバーとして機能させ、サーバーへのリクエストは ALB を通して行うようにしています。

また、ECR / CloudWatch / S3 / Secrets Manager との接続は NAT Gateway を使用するのではなく、VPC エンドポイントを使用するようにしました。  
VPC エンドポイントを選択した理由としては、NAT Gateway は VPC エンドポイントよりも料金が高いことと、今回実現したい「ECS と ECR / CloudWatch / S3 / Secrets Manager の接続」という面では VPC エンドポイントで機能として十分なためです。

### 1.3. 手順

上記の構成図を、以下の手順で構築していきます

1. ECR リポジトリを作成
2. VPC を作成
3. ALB を作成
4. RDS を作成
5. ECS を作成

アプリケーションコードや Dockerfile の内容については、この記事の本質とズレるため記述を省いています。
アプリケーションコードの詳細については以下の GitHub リンクに記載しております！

:::details アプリケーションコード
https://github.com/ren-yamanashi/ecs-fargate-cdk/blob/main/src/index.ts
:::

:::details Dockerfile
https://github.com/ren-yamanashi/ecs-fargate-cdk/blob/main/Dockerfile
::

## 2. 実装

:::message
この記事では前提として、TypeScript, CDK, AWS CLI のインストールは済んでいるものとして記述しております。
:::

### 2.1. 全体像の共有

具体的な実装に入る前に、今回の全体的な方針を考えます。
今回は、AWS リソースごとに Construct を作成して、Stack でその Construct を連携させる方針で考えています。  
そこまで大きな構成ではないため、全ての Construct をクラス分けせずに Stack に書くことも可能ですが、可読性の向上とリソース間の繋がりを明確化する目的でこのような方針を選択しました。  
最終的には、以下の感じで Stack を通じて Construct 間のやり取りを実現させたいです

```ts
export class SampleNodeAppStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // ECR
    const ecr = new Ecr(/** some properties */);

    // VPC
    const vpc = new Vpc(/** some properties */);

    // ALB
    const alb = new Alb(/** some properties */);

    // RDS
    const rds = new Rds(/** some properties */);

    // ECS(Fargate)
    const ecs = new Ecs(/** some properties */);
  }
}
```

また、ディレクトリ構成としては以下のように考えています

```bash
./lib/
├── constructs
│   ├── alb.ts
│   ├── ecs.ts
│   ├── ...etc
└── sample-node-app-stack.ts
```

### 2.2. ECR リポジトリを作成

まずは、ECR リポジトリを作成します。

#### 2.2.1. ECR 用の Construct を定義

ECR リポジトリの作成には、cdk ライブラリに含まれる L2 コンストラクトの他に cdk-ecr-deployment というライブラリを使用します。

https://github.com/cdklabs/cdk-ecr-deployment

このライブラリは、CDK で構成する Docker イメージを任意のリポジトリに保存できるようにするものです。

全体のコードを以下に示します

```ts:lib/construct/ecr.ts
import path from "node:path";

import { IgnoreMode, RemovalPolicy } from "aws-cdk-lib";
import {
  IRepository,
  Repository,
  RepositoryEncryption,
  TagMutability,
} from "aws-cdk-lib/aws-ecr";
import { DockerImageAsset, Platform } from "aws-cdk-lib/aws-ecr-assets";
import { DockerImageName, ECRDeployment } from "cdk-ecr-deployment";
import { Construct } from "constructs";

export class Ecr extends Construct {
  public readonly repository: IRepository;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.repository = new Repository(this, "Repository", {
      imageTagMutability: TagMutability.MUTABLE,
      encryption: RepositoryEncryption.AES_256,
      removalPolicy: RemovalPolicy.DESTROY,
      emptyOnDelete: true,
    });

    const image = new DockerImageAsset(this, "Image", {
      directory: path.join(__dirname, "../../"), // Dockerfileがあるディレクトリを指定
      platform: Platform.LINUX_ARM64,
      // NOTE: `.dockerignore`に列挙されているディレクトリ・ファイルを除外対象とする
      ignoreMode: IgnoreMode.DOCKER,
    });

    new ECRDeployment(this, "DeployDockerImage", {
      src: new DockerImageName(image.imageUri),
      dest: new DockerImageName(`${this.repository.repositoryUri}:latest`),
    });
  }
}

```

#### 2.2.2. 作成した Construct クラスを Stack でインスタンス化する

ここまでの工程で、ECR 用の Construct が完成しましたので、以下のように Construct を Stack でインスタンス化し、Stack を通じて他の Construct と連携できるようにします。

```ts:lib/sample-node-app-stack.ts
import type { StackProps } from "aws-cdk-lib";
import { Stack } from "aws-cdk-lib";
import type { Construct } from "constructs";
import { Ecr } from "./construct/ecr";

export class SampleNodeAppStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // ECR
    const ecr = new Ecr(this, "Ecr");
  }
}
```

### 2.3. VPC を作成

次に、CDK の L2 コンストラクトを使用して VPC を作成します。  
上記の構成図の通り、今回は publicSubnet 1 つ, privateSubnet 1 つをそれぞれマルチ AZ で構成します。

#### 2.3.1. VPC 用の Construct を定義

以下のように VPC 用の Construct を定義します

```ts:lib/construct/vpc.ts
import { IVpc, IpAddresses, SubnetType, Vpc as _Vpc } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

export class Vpc extends Construct {
  // NOTE: 別スタックから参照できるようにする
  public readonly resource: IVpc;

  constructor(scope: Construct, id: string, private readonly resourceName: string) {
    super(scope, id);

    this.resource = new _Vpc(this, "Vpc", {
      availabilityZones: ["ap-northeast-1a", "ap-northeast-1c"],
      // NOTE: ネットワークアドレス部:16bit, ホストアドレス部:16bit
      ipAddresses: IpAddresses.cidr("192.168.0.0/16"),
      subnetConfiguration: [
        {
          name: "public",
          cidrMask: 26, // 小規模なので`/26`で十分(ネットワークアドレス部: 26bit, ホストアドレス部: 6bit)
          subnetType: SubnetType.PUBLIC,
        },
        // NOTE: 外部との通信はALBを介して行う(NATGatewayを介さない)ので、ISOLATEDを指定(ECRとの接続はVPCエンドポイントを利用する)
        {
          name: "isolated",
          cidrMask: 26,
          subnetType: SubnetType.PRIVATE_ISOLATED,
        },
      ],
      natGateways: 0,
      createInternetGateway: true,
    });
  }
}
```

IP アドレス(CIDR)と、サブネットタイプについて解説します。

- **IP アドレス(CIDR)について**
  IP アドレス(CIDR)は[公式ドキュメント](https://docs.aws.amazon.com/ja_jp/vpc/latest/userguide/vpc-cidr-blocks.html)の推奨に従い`192.168.0.0/16`としています  
  (ネットワークアドレス部:16bit, ホストアドレス部:16bit)  
  また、極力無駄なプライベート IP アドレスの生成は避けたいので CIDR マスクは 26(ネットワークアドレス部:26bit,ホストアドレス部:6bit)としています。  
  実際の運用を考えた場合は、規模の拡大なども考慮してもう少し大きめの CIDR マスクの方が良いかもしれません。

- **サブネットタイプについて**
  いずれの privateSubnet も直接の外部通信は行わなず、NAT Gateway も必要としないので、サブネットタイプは`PRIVATE_ISOLATED` を指定しています。  
  サブネットタイプについては、以下のドキュメントを参考にしました  
  [enum SubnetType · AWS CDK](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ec2.SubnetType.html#members)

#### 2.3.2. VPC エンドポイントの作成

上記の構成図の通り、S3 / CloudWatch / ECR / Secrets Manager 用の VPC エンドポイントを作成していきます。  
VPC エンドポイントには、ゲートウェイ型とインターフェース型の 2 種類があり、上記の 3 つのうち、S3 はゲートウェイ型で、CloudWatch / ECR / Secrets Manager はインターフェース型となるので、それぞれ種類に応じた形で作成していきます。

(各種類については以下のドキュメントを参考にしました)
[AWS PrivateLink の概念 - Amazon Virtual Private Cloud](https://docs.aws.amazon.com/ja_jp/vpc/latest/privatelink/concepts.html#concepts-vpc-endpoints)

以下のようにコードを修正します

```diff ts:lib/construct/vpc.ts
+ import {
+   GatewayVpcEndpointAwsService,
+   IVpc,
+   InterfaceVpcEndpointAwsService,
+   IpAddresses,
+   SubnetType,
+   Vpc as _Vpc
+ } from "aws-cdk-lib/aws-ec2"
- import { IpAddresses, SubnetType, Vpc as _Vpc } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

export class Vpc extends Construct {
   /** 省略 */
  constructor(scope: Construct, id: string, private readonly resourceName: string) {
    super(scope, id);

    this.resource = new _Vpc(this, "Vpc", {
      /** 省略 */
    });

+   // NOTE: VPCエンドポイントを作成
+   this.resource.addInterfaceEndpoint("EcrEndpoint", {
+     service: InterfaceVpcEndpointAwsService.ECR,
+   });
+   this.resource.addInterfaceEndpoint("EcrDkrEndpoint", {
+     service: InterfaceVpcEndpointAwsService.ECR_DOCKER,
+   });
+   this.resource.addInterfaceEndpoint("CwLogsEndpoint", {
+     service: InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
+   });
+   this.resource.addInterfaceEndpoint("SecretsManagerEndpoint", {
+     service: InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
+   });
+   this.resource.addGatewayEndpoint("S3Endpoint", {
+     service: GatewayVpcEndpointAwsService.S3,
+     subnets: [
+       {
+         subnets: this.resource.isolatedSubnets,
+       },
+     ],
+   });
  }
}
```

#### 2.3.3. 作成した Construct クラスを Stack でインスタンス化する

ここまでの工程で、Vpc 用の Construct が完成しましたので、以下のように Construct を Stack でインスタンス化し、Stack を通じて他の Construct と連携できるようにします。
(ついでに、ECR のリポジトリも作成しておきます)

```ts:lib/sample-node-app-stack.ts
import type { StackProps } from "aws-cdk-lib";
import { Stack } from "aws-cdk-lib";
import type { Construct } from "constructs";
import { Ecr } from "./constructs/ecr";
import { Vpc } from "./construct/vpc";

export class SampleNodeAppStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // ECR
    const ecr = new Ecr(this, "Ecr");

    // VPC
    const vpc = new Vpc(this, "Vpc", resourceName);
  }
}
```

### 2.4. ALB を作成

#### 2.4.1. ALB 用の Construct を実装

上記の構成図の通り、ALB は publicSubnet に配置します。
今回、ALB のターゲットとなるのは ECS になりますが、ALB と ECS の通信は HTTP で行うため、プロトコルは HTTP を指定します。
ALB と ECS の通信を図にすると以下のようになるかと思います。

![alb-ecs.drawio.png](https://storage.googleapis.com/zenn-user-upload/70b65ff0cbfe-20240503.png)

コード全体は以下の通りです

```ts:lib/construct/alb.ts
import { IConnectable, SubnetType, type IVpc } from "aws-cdk-lib/aws-ec2";
import type { IApplicationLoadBalancer } from "aws-cdk-lib/aws-elasticloadbalancingv2";
import {
  ApplicationLoadBalancer,
  ApplicationProtocol,
  ApplicationTargetGroup,
  Protocol,
  TargetType,
} from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Construct } from "constructs";

interface AlbProps {
  vpc: Vpc;
  resourceName: string;
  securityGroup: SecurityGroup;
  subnets: SubnetSelection;
}

export class Alb extends Construct {
  /**
   * 接続可能なALBのインスタンス
   * @example リソースをALBと接続する際には、このインスタンスを利用して以下のように接続を行う
   * ```typescript
   * // `allowDefaultPortTo`の引数には接続したいリソースを指定
   * connectableInstance.connections.allowDefaultPortTo(ecsService);
   * ```
   */
  public readonly connectableInstance: IConnectable;

  private readonly resource: IApplicationLoadBalancer;

  constructor(scope: Construct, id: string, props: AlbProps) {
    super(scope, id);

    // NOTE: ターゲットグループの作成
    const targetGroup = new ApplicationTargetGroup(this, "AlbTargetGroup", {
      vpc: props.vpc,
      targetType: TargetType.IP,
      protocol: ApplicationProtocol.HTTP,
      port: 80,
      healthCheck: {
        path: "/",
        port: "80",
        protocol: Protocol.HTTP,
        healthyHttpCodes: "200",
      },
    });

    // NOTE: ALBの作成
    this.resource = new ApplicationLoadBalancer(this, "Alb", {
      vpc: props.vpc,
      internetFacing: true,
      vpcSubnets: props.vpc.selectSubnets({ subnetType: SubnetType.PUBLIC }),
    });

    // NOTE: リスナーの作成
    this.resource.addListener("AlbListener", {
      protocol: ApplicationProtocol.HTTP,
      defaultTargetGroups: [targetGroup],
    });

    this.connectableInstance = this.resource;
  }
}

```

上記のコードでは、`IConnectable` 型の `connectableInstance` を public 変数として公開しています。  
この `connectableInstance` を利用し、以下のようにコードを記述することで、ALB と ECS の接続を行うことができます。

```ts
alb.connectableInstance.connections.allowDefaultPortTo(ecsService);
```

#### 2.4.2. 外部からターゲットを登録できるようにする

上述の通り今回の構成では、ECS が ALB のターゲットになります。  
このターゲットの登録は、以下のように listener を使用して行います。

```ts
alb.listener.addTargets("Ecs", {
  /** 省略 */
});
```

これを Stack を通じて行えるように、外部から listener を取得できるようにしておきます。

```diff ts:lib/construct/alb.ts
- import type { IApplicationLoadBalancer } from "aws-cdk-lib/aws-elasticloadbalancingv2";
+ import type {
+   IApplicationListener,
+   IApplicationLoadBalancer,
+ } from "aws-cdk-lib/aws-elasticloadbalancingv2";

export class Alb extends Construct {
  public readonly value: ApplicationLoadBalancer;

  constructor(scope: Construct, id: string, props: AlbProps) {
    /** 省略 */
  }

+ /**
+  * ALBのリスナー
+  */
+ get listener(): IApplicationListener {
+    // NOTE: リスナーはconstructor内で1つしか作成しないため、配列の一番目の要素を取得
+    //       public変数には`addListener`メソッドを呼び出し可能な変数がないため、配列の要素が1つ以外の場合は考慮しない
+    return this.resource.listeners[0];
+ }
}
```

#### 2.4.3. 作成した Construct クラスを Stack でインスタンス化する

以下のように Construct を Stack でインスタンス化します

```ts:lib/sample-node-app-stack.ts
import type { StackProps } from "aws-cdk-lib";
import { Stack } from "aws-cdk-lib";
import type { Construct } from "constructs";

import { Alb } from "./constructs/alb";
import { Ecr } from "./constructs/ecr";
import { Vpc } from "./construct/vpc";

export class SampleNodeAppStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // ECR
    const ecr = new Ecr(this, "Ecr");

    // VPC
    const vpc = new Vpc(this, "Vpc", resourceName);

    // ALB
    const alb = new Alb(this, "Alb", {
      vpc: vpc.resource,
    });
  }
}
```

### 2.5. RDS を作成

ここまでの構築により、インターネットから VCP 内の AWS リソースにアクセスできるようになりました。  
ここから ECS を構築したいのですが、今回のアプリケーションは DB との接続が必要で、アプリケーション立ち上げ時に DB との接続確立プロセスが実行される用になっています。  
この時に、DB が立ち上がっていない状態だとエラーになってしまうので、ECS より先に RDS を構築していきます。

RDS の構築手順は以下の通りです。

1. Construct を定義
2. パスワードを生成
3. インスタンスを作成

#### 2.5.1. Construct を定義

まずは、以下のように RDS 用の Construct を定義します

```ts:lib/construct/rds.ts
import { Construct } from "constructs";

export class Rds extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);
  }
}
```

#### 2.5.2. パスワードを生成

パスワードの生成を行いたいのですが、CDK のソースコードにハードコーディングするのはセキュリティ的に良くないので、Secrets Manager に保存する方針で考えます。  
これを実現するために、`Credentials` クラスの`fromGeneratedSecret`メソッドを使用して以下のように実装します。

```diff ts:lib/construct/rds.ts
+ import { Credentials } from "aws-cdk-lib/aws-rds";

+ interface RdsProps {
+   /**
+    * ユーザ名
+    * - <your_name>の形式(スネークケース)で指定する
+    * @example "taro_yamada"
+    */
+   readonly username: string;
+ }

export class Rds extends Construct {
-  constructor(scope: Construct, id: string) {
+  constructor(scope: Construct, id: string, props: RdsProps) {
    super(scope, id);

+   // NOTE: パスワードを自動生成してSecrets Managerに保存
+   const credentials = Credentials.fromGeneratedSecret(props.username);
  }
}
```

#### 2.5.3 インスタンスの作成

続いて、インスタンスの実装を行います。
今回は練習用(勉強用)であり、高性能より低価格を求めたいです。その為、Aurora を使用しない MySQL を選択し、インスタンスサイズは MICRO を選択しています。

また、ALB と同様に、ECS と接続を行うために `IConnectable` 型の `connectableInstance` を public 変数として公開します

```diff ts:lib/construct/rds.ts
+ import { InstanceClass, InstanceSize, InstanceType, type SecurityGroup, type SubnetSelection, type Vpc } from "aws-cdk-lib/aws-ec2";
+ import { Credentials, DatabaseInstance, DatabaseInstanceEngine, NetworkType, PostgresEngineVersion } from "aws-cdk-lib/aws-rds";
- import { Credentials } from "aws-cdk-lib/aws-rds";

interface RdsProps {
+ /**
+  * RDSを作成するVPC
+  */
+ readonly vpc: IVpc;
+ /**
+  * データベース名
+  * - <database_name>の形式(スネークケース)で指定する
+  * @example "cdk_training_taro_yamada"
+  */
+ readonly databaseName: string;
  /**
   * ユーザ名
   * - <your_name>の形式(スネークケース)で指定する
   * @example "taro_yamada"
   */
  readonly username: string;
}

export class Rds extends Construct {
+ /**
+  * 接続可能なRDSのインスタンス
+  * - リソースをRDSに接続する際には、このインスタンスを利用して以下のように接続を行う
+  * ```typescript
+  * // `allowDefaultPortFrom`の引数には接続したいリソースを指定
+  * connectableInstance.connections.allowDefaultPortFrom(ecsService);
+  * ```
+  */
+ public readonly connectableInstance: IConnectable;

  constructor(scope: Construct, id: string, props: RdsProps) {
    super(scope, id);
    /** 省略 */
    // NOTE: パスワードを自動生成してSecrets Managerに保存
    const credentials = Credentials.fromGeneratedSecret(props.username);

+   // NOTE: インスタンスの作成
+   const instance = new DatabaseInstance(this, "MysqlInstance", {
+     engine: DatabaseInstanceEngine.mysql({
+       version: MysqlEngineVersion.VER_8_0,
+     }),
+     instanceType: InstanceType.of(
+       InstanceClass.T4G,
+       InstanceSize.MICRO,
+     ),
+     databaseName: props.databaseName,
+     vpc: props.vpc,
+     vpcSubnets: props.vpc.selectSubnets({
+       subnetType: SubnetType.PRIVATE_ISOLATED,
+     }),
+     networkType: NetworkType.IPV4,
+     availabilityZone: "ap-northeast-1a",
+     credentials,
+     removalPolicy: RemovalPolicy.DESTROY,
+   });

+   this.connectableInstance = instance;
  }
}
```

#### 2.5.4. シークレットの取得

続いて、Secrets Manager に保存した RDS のシークレット情報を、ECS のタスクに指定するために `secrets` という変数を public 変数として公開します  
(この変数を通じて RDS のシークレット情報にアクセスできるようにします)

実装は以下の通りです

```diff ts:lib/construct/rds.ts
+ import { Secret } from "aws-cdk-lib/aws-secretsmanager";

export class Rds extends Construct {
+ /**
+  * データベースに接続するためのシークレット情報
+  *
+  * ※シークレットはECSコンテナの`secrets`プロパティに加工せずに指定可能
+  * ```typescript
+  * // ECSのタスク定義にコンテナを追加するコードの例
+  * taskDefinition.addContainer("EcsContainer", {
+  *   secrets: rds.secrets,
+  * });
+  * ```
+  */
+ public readonly secrets: { [key: string]: Secret };

  constructor(scope: Construct, id: string, props: RdsProps) {
    // 省略

+　// NOTE: IConnectableは`secret`プロパティを持たないので、thisではなく定数の`instance`を利用してシークレットを取得
+   const secret = instance.secret;
+   if (!secret) throw new Error("RDSのシークレットが取得できませんでした。");

+   this.secrets = this.getDatabaseSecrets(secret);
  }

+ /**
+  * RDSのシークレット情報を取得する
+  */
+ private getDatabaseSecrets(secret: ISecret): { [key: string]: Secret } {
+   return {
+     DATABASE_ENGINE: Secret.fromSecretsManager(secret, "engine"),
+     DATABASE_USERNAME: Secret.fromSecretsManager(secret, "username"),
+     DATABASE_PASSWORD: Secret.fromSecretsManager(secret, "password"),
+     DATABASE_HOST: Secret.fromSecretsManager(secret, "host"),
+     DATABASE_PORT: Secret.fromSecretsManager(secret, "port"),
+     DATABASE_NAME: Secret.fromSecretsManager(secret, "dbname"),
+   };
+ }
}
```

#### 2.5.5. 作成した Construct クラスを Stack でインスタンス化する

以下のように Construct を Stack でインスタンス化します

```diff ts:lib/sample-node-app-stack.ts
+ import { Rds } from "./construct/rds";

export class SampleNodeAppStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps, readonly resourceName = "sample-node-app") {
    super(scope, id, props);

    /** 省略 */

    // ALB
    const alb = new Alb(this, "Alb", {
      vpc: vpc.value,
      resourceName,
      securityGroup: albSecurityGroup,
      subnets: vpc.getPublicSubnets(),
    });

+   // RDS
+   new Rds(this, "Rds", {
+     vpc: vpc.value,
+     databaseName: "sample_database",
+     username: "ren_yamanashi",
+   });
  }
}
```

### 2.6. ECS を作成

RDS を構築し、さらに Secrets Manager からシークレットを取得する準備ができたので、続いて ECS を構築していきます。  
ECS の構築手順は以下の通りです。

1. ECS クラスター・タスク定義の作成
2. タスク定義に ECR コンテナを追加
3. ECS サービスの作成
4. ALB のターゲットグループに ECS を追加

#### 2.6.1. ECS クラスター・タスク定義の作成

以下のコードのように ECS 用の Construct を定義し、クラスター及びタスク定義を作成していきます。

```ts:lib/construct/ecs.ts
import { Construct } from "constructs";
import { Cluster, CpuArchitecture, FargateTaskDefinition } from "aws-cdk-lib/aws-ecs";
import type { IVpc } from "aws-cdk-lib/aws-ec2";

interface EcsProps {
  /**
   * ECSを作成するVPC
   */
  readonly vpc: IVpc;
}

export class Ecs extends Construct {
  constructor(scope: Construct, id: string, props: EcsProps) {
    super(scope, id);

    // NOTE: クラスターの作成
    const cluster = new Cluster(this, "EcsCluster", {
      vpc: props.vpc,
    });

    // NOTE: タスク定義の作成
    const taskDefinition = new FargateTaskDefinition(this, "EcsTaskDefinition", {
      cpu: 256,
      memoryLimitMiB: 512,
      runtimePlatform: {
        cpuArchitecture: CpuArchitecture.ARM64,
      },
    });
  }
}

```

#### 2.6.2. タスク定義に ECR コンテナを追加

続いて、タスク定義に ECR コンテナを追加していきます。  
また、ECS のログ情報が CloudWatch Logs に送信されるように AwsLogDriver クラスを使用します。  
今回は本番環境で運用するわけではないので、ログの保持期間は 1 日と短く設定しておきます。

```diff ts:lib/construct/ecs.ts
+ import { AwsLogDriver, Cluster, ContainerImage, CpuArchitecture, FargateTaskDefinition } from "aws-cdk-lib/aws-ecs";
+ import { RetentionDays } from "aws-cdk-lib/aws-logs";
+ import type { IRepository } from "aws-cdk-lib/aws-ecr";
- import { Cluster, CpuArchitecture, FargateTaskDefinition } from "aws-cdk-lib/aws-ecs";

interface EcsProps {
  /**
   * ECSを作成するVPC
   */
  readonly vpc: IVpc;
+ /**
+  * ECRリポジトリ
+  */
+ readonly repository: IRepository;
+ /**
+  * ECSと接続を行うリソース
+  */
+ readonly connections: { alb: IConnectable; rds: IConnectable };
+ /**
+  * コンテナに渡すシークレット
+  */
+ readonly secrets: { [key: string]: Secret };
}

export class Ecs extends Construct {
  constructor(scope: Construct, id: string, props: EcsProps) {
    super(scope, id);

    /** 省略 */

+   // NOTE: ロググループの作成
+   const logGroup = new LogGroup(this, "LogGroup", {
+     logGroupName: "/ecs/sample-node-app",
+     removalPolicy: RemovalPolicy.DESTROY,
+     retention: RetentionDays.ONE_DAY,
+   });
+   const logDriver = new AwsLogDriver({
+     logGroup,
+     streamPrefix: "container",
+   });

    // NOTE: タスク定義の作成
    const taskDefinition = new FargateTaskDefinition(this, "EcsTaskDefinition", {
      /** 省略 */
    });
+   taskDefinition.addContainer("Container", {
+     image: ContainerImage.fromEcrRepository(props.ecrRepository),
+     portMappings: [{ containerPort: 80, hostPort: 80 }],
+     secrets: props.secrets,
+     logging: logDriver,
+   });
  }
}
```

#### 2.6.3. ECS サービスの作成

ECS クラスター・タスク定義が作成でき、さらにコンテナの追加も行えたので、続いて ECS サービスを作成していきます
上記の構成図の通り、今回は ECS をマルチ AZ で構成するので、必要なタスク数は 2 としています。

また、作成した ECS サービスと ALB / RDS の接続を行うために、`IConnectable`を利用した実装も行います。

```diff ts:lib/construct/ecs.ts
+ import { AwsLogDriver, Cluster, ContainerImage, CpuArchitecture, FargateService, FargateTaskDefinition, TaskDefinitionRevision } from "aws-cdk-lib/aws-ecs";
- import { AwsLogDriver, Cluster, ContainerImage, CpuArchitecture, FargateTaskDefinition } from "aws-cdk-lib/aws-ecs";
+ import type { SecurityGroup, SubnetSelection, Vpc } from "aws-cdk-lib/aws-ec2";
- import type { Vpc } from "aws-cdk-lib/aws-ec2";

interface EcsProps {
  /**
   * ECSを作成するVPC
   */
  readonly vpc: IVpc;
  /**
   * ECRリポジトリ
   */
  readonly repository: IRepository;
  /**
   * ECSと接続を行うリソース
   */
  readonly connections: { alb: IConnectable; rds: IConnectable };
  /**
   * コンテナに渡すシークレット
   */
  readonly secrets: { [key: string]: Secret };
}

export class Ecs extends Construct {
+ /**
+  * ロードバランサーのターゲットに指定するリソース
+  */
+ public readonly loadBalancerTarget: IEcsLoadBalancerTarget;

  constructor(scope: Construct, id: string, props: EcsProps) {
    super(scope, id);

    /** 省略 */

    // NOTE: タスク定義の作成
    /** 省略 */
    taskDefinition.addContainer("EcsContainer", {
      /** 省略 */
    });

+   // NOTE: Fargate起動タイプでサービスの作成
+   this.fargateService = new FargateService(this, "EcsFargateService", {
+     cluster,
+     taskDefinition,
+     desiredCount: 2,
+     securityGroups: [props.securityGroup],
+     vpcSubnets: props.vpc.selectSubnets({
+       subnetType: SubnetType.PRIVATE_ISOLATED,
+     }),
+     taskDefinitionRevision: TaskDefinitionRevision.LATEST,
+   });

+   // NOTE: FargateServiceは`default port`を持たないため、明示的に指定する
+   fargateService.connections.allowFrom(props.connections.alb, Port.tcp(80)); // IConnectableを利用してECSとALBを接続
+   props.connections.rds.connections.allowDefaultPortFrom(fargateService); // IConnectableを利用してECSとRDSを接続
```

#### 2.6.4. ALB のターゲットグループに ECS を追加

最後に、Stack 側で ECS 用の Construct をインスタンス化し、ALB のターゲットに登録します。

```diff ts:lib/sample-node-app-stack.ts
+ import { Ecs } from "./construct/ecs";
+ import { Duration, Stack } from "aws-cdk-lib";
- import { Stack } from "aws-cdk-lib";

export class SampleNodeAppStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps, readonly resourceName = "sample-node-app") {
    super(scope, id, props);

    /** 省略 */

+   const ecs = new Ecs(this, "Ecs", {
+     vpc: vpc.value,
+     repository: ecr.repository,
+     ecrRepository: repository,
+     connections: {
+       alb: alb.connectableInstance,
+       rds: rds.connectableInstance,
+     },
+     secrets: rds.secrets,
+   });

+   // NOTE: ターゲットグループにタスクを追加
+   alb.addTargets("Ecs", {
+     port: 80,
+     targets: [ecs.fargateService],
+     healthCheck: {
+       path: "/",
+       interval: Duration.minutes(1),
+     },
+   });
  }
}

```

ここまでで、最初の構成図の通りの構築ができました。
デプロイした後、実際に ALB に対してリクエストを送って動作確認をしたいので、ALB のドメイン名を出力するように実装しておきます。

```diff ts:lib/sample-node-app-stack.ts
+ import { CfnOutput, Duration, Stack } from "aws-cdk-lib";
- import { Duration, Stack } from "aws-cdk-lib";

export class SampleNodeAppStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps, readonly resourceName = "sample-node-app") {
    super(scope, id, props);

    /** 省略 */

    // NOTE: ターゲットグループにタスクを追加
    alb.addTargets("Ecs", {
      /** 省略 */
    });

+   // NOTE: ALBのドメイン名を出力
+   new CfnOutput(this, "LoadBalancerDomainName", {
+     value: alb.value.loadBalancerDnsName,
+   });
  }
}

```

```diff
cdk deploy
```

デプロイが完了すると、ALB のドメイン名が出力されるので、そこにリクエストを投げてみます。

```bash
# `/`にGETリクエストを送信
curl http://<ALBのドメイン名>
Hello World
```

```bash
# `/posts`にPOSTリクエストを送信
curl -X POST http://<ALBのドメイン名>/posts -H "Content-Type: application/json" -d '{"title": "sample post"}'
{"id":"4bc54a3f-9c9d-4662-9d45-856baf434ea2","title":"sample post"}
```

```bash
# `/posts`にGETリクエストを送信
curl http://<ALBのドメイン名>/posts
{"id":"4bc54a3f-9c9d-4662-9d45-856baf434ea2","title":"sample post"}
```

無事、レスポンスが帰ってきました！

## 3. まとめ

今回は、AWS CDK を使用して ECS(Fargate)と RDS をマルチ AZ 構成で構築してみました。
私は今回が CDK を触るのが初めてだったのですが、各リソースとのつながりを理解しながら構築でき、とても開発体験が良かったです。
今後は他の AWS リソースについて触れたり、IPv6 構成などを試したいと思います。

### 3.1. 成果物

今回最終的なソースコードは以下になります
https://github.com/ren-yamanashi/ecs-fargate-cdk

### 3.2. 参考にしたサイト

以下のサイトを参考にさせていただきました！

- VPC Construct の API Reference
  https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ec2.Vpc.html
- SubnetType の API Reference
  https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ec2.SubnetType.html#members
- VPC エンドポイントの種類についての公式ドキュメント
  https://docs.aws.amazon.com/ja_jp/vpc/latest/privatelink/concepts.html#concepts-vpc-endpoints
- VPC CIDR ブロックについての公式ドキュメント
  https://docs.aws.amazon.com/ja_jp/vpc/latest/userguide/vpc-cidr-blocks.html
- RDS のパスワードを自動生成する方法
  https://dev.classmethod.jp/articles/automatically-generate-a-password-with-cdk/
