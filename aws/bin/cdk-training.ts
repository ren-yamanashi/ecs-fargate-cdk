#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";

import "source-map-support/register";
import { CdkTrainingStack } from "../lib/cdk-training-stack";

const app = new cdk.App();

new CdkTrainingStack(app, "CdkTrainingStack");
