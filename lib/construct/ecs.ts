import { Construct } from "constructs";
import { AwsLogDriver, Cluster, ContainerImage, CpuArchitecture, FargateService, FargateTaskDefinition, TaskDefinitionRevision } from "aws-cdk-lib/aws-ecs";
import type { IRepository } from "aws-cdk-lib/aws-ecr";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import type { SecurityGroup, SubnetSelection, Vpc } from "aws-cdk-lib/aws-ec2";

interface EcsProps {
  vpc: Vpc;
  resourceName: string;
  ecrRepository: IRepository;
  securityGroup: SecurityGroup;
  subnets: SubnetSelection;
  env: {
    databaseUrl: string;
  };
}

export class Ecs extends Construct {
  public readonly fargateService: FargateService;

  constructor(scope: Construct, id: string, props: EcsProps) {
    super(scope, id);

    // NOTE: クラスターの作成
    const cluster = new Cluster(this, "EcsCluster", {
      clusterName: `${props.resourceName}-cluster`,
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
    const logDriver = new AwsLogDriver({
      streamPrefix: "ecs-fargate",
      logRetention: RetentionDays.ONE_DAY,
    });
    taskDefinition.addContainer("EcsContainer", {
      image: ContainerImage.fromEcrRepository(props.ecrRepository),
      portMappings: [{ containerPort: 80, hostPort: 80 }],
      environment: {
        DATABASE_URL: props.env.databaseUrl,
      },
      logging: logDriver,
    });

    // NOTE: Fargate起動タイプでサービスの作成
    this.fargateService = new FargateService(this, "EcsFargateService", {
      cluster,
      taskDefinition,
      desiredCount: 2,
      securityGroups: [props.securityGroup],
      vpcSubnets: props.subnets,
      taskDefinitionRevision: TaskDefinitionRevision.LATEST,
    });
  }
}
