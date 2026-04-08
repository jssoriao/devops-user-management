# IAM Policies for Development Account Attached to Engineering IAM Groups

```bash
# backend-developers
aws cloudformation deploy \
--template-file backend-developers-policy.yaml \
--stack-name dev-backend-developers-policy \
--capabilities CAPABILITY_NAMED_IAM \
--tags Project=org-iam Environment=dev Owner=devops@myorg.com ManagedBy=cloudformation

# frontend-developers
aws cloudformation deploy \
--template-file frontend-developers-policy.yaml \
--stack-name dev-frontend-developers-policy \
--capabilities CAPABILITY_NAMED_IAM \
--tags Project=org-iam Environment=dev Owner=devops@myorg.com ManagedBy=cloudformation
```
