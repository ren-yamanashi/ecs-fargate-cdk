import { Construct } from "constructs";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";

export class SecretsManager extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);
  }

  public getSecretValue<T extends [string, ...string[]]>(secretKeys: T): { [key in T[number]]: string } {
    const secretCompleteArn = process.env.SECRET_MANAGER_ARN;
    if (!secretCompleteArn) {
      throw new Error("Failed to get SECRET_MANAGER_ARN");
    }

    const secret = Secret.fromSecretAttributes(this, "SecretStrings", {
      secretCompleteArn,
    });

    return secretKeys.reduce((acc, key) => {
      const secretValue = secret.secretValueFromJson(key).unsafeUnwrap();
      if (!secretValue) {
        throw new Error(`Failed to get ${key}`);
      }

      // eslint-disable-next-line ts/prefer-ts-expect-error, ts/ban-ts-comment
      // @ts-ignore
      acc[key] = secretValue;
      return acc;
    }, {} as { [key in T[number]]: string });
  }
}
