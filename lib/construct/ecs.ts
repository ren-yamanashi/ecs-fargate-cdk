import { Construct } from "constructs";
import * as ecs from "aws-cdk-lib/aws-ecs";
import type * as ecr from "aws-cdk-lib/aws-ecr";
import * as logs from "aws-cdk-lib/aws-logs";
import type * as ec2 from "aws-cdk-lib/aws-ec2";
import type { Vpc } from "./vpc";
import type { Rds } from "./rds";
import type { SecretsManager } from "./secretsManager";

interface EcsProps {
  vpc: Vpc;
  resourceName: string;
  ecrRepository: ecr.IRepository;
  rds: Rds;
  ecsSecurityGroup: ec2.SecurityGroup;
  secretsManager: SecretsManager;
}

export class Ecs extends Construct {
  public readonly fargateService: ecs.FargateService;

  constructor(scope: Construct, id: string, props: EcsProps) {
    super(scope, id);

    // NOTE: クラスターの作成
    const cluster = new ecs.Cluster(this, "EcsCluster", {
      clusterName: `${props.resourceName}-cluster`,
      vpc: props.vpc.value,
    });

    // NOTE: タスク定義の作成
    const taskDefinition = new ecs.FargateTaskDefinition(this, "EcsTaskDefinition", {
      cpu: 256,
      memoryLimitMiB: 512,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
      },
    });
    taskDefinition.addContainer("EcsContainer", {
      image: ecs.ContainerImage.fromEcrRepository(props.ecrRepository),
      portMappings: [{ containerPort: 80, hostPort: 80 }],
      environment: {
        DATABASE_URL: this.getDatabaseUrl(props.rds.secretName, props.secretsManager),
      },
      logging: new ecs.AwsLogDriver(
        {
          streamPrefix: "ecs-fargate",
          logRetention: logs.RetentionDays.ONE_DAY,
        },
      ),
    });

    // NOTE: Fargate起動タイプでサービスの作成
    this.fargateService = new ecs.FargateService(this, "EcsFargateService", {
      cluster,
      taskDefinition,
      desiredCount: 1,
      assignPublicIp: true,
      securityGroups: [props.ecsSecurityGroup],
      vpcSubnets: props.vpc.getEcsIsolatedSubnets(),
    });
  }

  private getDatabaseUrl(secretName: string, secretsManager: SecretsManager): string {
    const keys: ["username", "password", "host", "port", "dbname"] = ["username", "password", "host", "port", "dbname"];
    const { username, password, host, port, dbname } = secretsManager.getSecretValue<typeof keys>(secretName, keys);
    return `postgresql://${username}:${password}@${host}:${port}/${dbname}`;
  }
}
