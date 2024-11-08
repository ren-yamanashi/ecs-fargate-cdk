import { Construct } from "constructs";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";

export class SecretsManager extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);
  }

  public getSecretValue<T extends [string, ...string[]]>(secretKeys: T, arn: string): { [key in T[number]]: string } {
    const secret = Secret.fromSecretAttributes(this, "SecretStrings", {
      secretCompleteArn: arn,
    });

    return secretKeys.reduce((acc, key) => {
      const secretValue = secret.secretValueFromJson(key).unsafeUnwrap();
      if (!secretValue) {
        throw new Error(`Failed to get ${key}`);
      }

      acc[key as keyof { [key in T[number]]: string }] = secretValue;
      return acc;
    }, {} as { [key in T[number]]: string });
  }
}
