import { Duration, RemovalPolicy } from "aws-cdk-lib";
import { MetricAggregationType } from "aws-cdk-lib/aws-applicationautoscaling";
import {
  IConnectable,
  Port,
  SubnetType,
  type IVpc
} from "aws-cdk-lib/aws-ec2";
import type { IRepository } from "aws-cdk-lib/aws-ecr";
import {
  AwsLogDriver,
  Cluster,
  ContainerImage,
  CpuArchitecture,
  FargateService,
  FargateTaskDefinition,
  IEcsLoadBalancerTarget,
  Secret,
  TaskDefinitionRevision
} from "aws-cdk-lib/aws-ecs";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";


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
  /**
   * ロードバランサーのターゲットに指定するリソース
   */
  public readonly loadBalancerTarget: IEcsLoadBalancerTarget;

  constructor(scope: Construct, id: string, props: EcsProps) {
    super(scope, id);

    // NOTE: クラスターの作成
    const cluster = new Cluster(this, "Cluster", {
      vpc: props.vpc,
    });

    // NOTE: ロググループの作成
    const logGroup = new LogGroup(this, "LogGroup", {
      logGroupName: "/ecs/cdk-training-nigg-ecs",
      removalPolicy: RemovalPolicy.DESTROY,
      retention: RetentionDays.ONE_DAY,
    });
    const logDriver = new AwsLogDriver({
      logGroup,
      streamPrefix: "container",
    });

    // NOTE: タスク定義の作成
    const taskDefinition = new FargateTaskDefinition(this, "TaskDefinition", {
      cpu: 256,
      memoryLimitMiB: 512,
      runtimePlatform: {
        cpuArchitecture: CpuArchitecture.ARM64,
      },
    });
    taskDefinition.addContainer("Container", {
      image: ContainerImage.fromEcrRepository(props.repository),
      portMappings: [{ containerPort: 80, hostPort: 80 }],
      secrets: props.secrets,
      logging: logDriver,
    });

    // NOTE: Fargate起動タイプでサービスの作成
    const fargateService = new FargateService(this, "Service", {
      cluster,
      taskDefinition,
      desiredCount: 2,
      vpcSubnets: props.vpc.selectSubnets({
        subnetType: SubnetType.PRIVATE_ISOLATED,
      }),
      taskDefinitionRevision: TaskDefinitionRevision.LATEST,
    });

    // NOTE: FargateServiceは`default port`を持たないため、明示的に指定する
    fargateService.connections.allowFrom(props.connections.alb, Port.tcp(80));
    props.connections.rds.connections.allowDefaultPortFrom(fargateService);

    // NOTE: オートスケーリングのターゲット設定
    const scaling = fargateService.autoScaleTaskCount({
      minCapacity: 2,
      maxCapacity: 6,
    });

    // NOTE: CPU使用率に応じてスケールアウト・スケールイン
    scaling.scaleOnMetric("StepScaling", {
      metric: fargateService.metricCpuUtilization({
        period: Duration.seconds(60),
      }),
      scalingSteps: [
        { lower: 70, change: +1 },
        { upper: 30, change: -1 },
      ],
      metricAggregationType: MetricAggregationType.AVERAGE, 
      cooldown: Duration.seconds(60),
    });

    this.loadBalancerTarget = fargateService;
  }
}
