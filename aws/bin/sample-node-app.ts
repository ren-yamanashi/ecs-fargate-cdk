#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";

import "source-map-support/register";
import { SampleNodeAppStack } from "../lib/sample-node-app-stack";

const app = new cdk.App();

new SampleNodeAppStack(app, "SampleNodeApp");
