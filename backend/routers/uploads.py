from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from auth import get_current_user
from models import User
import boto3
import uuid
import os
from dotenv import load_dotenv
from schemas import PresignedUrlRequest, PresignedUrlResponse
load_dotenv()



router = APIRouter(prefix="/uploads", tags=["Uploads"])

s3_client = boto3.client(
    "s3",
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    region_name=os.getenv("AWS_REGION")
)

S3_BUCKET = os.getenv("S3_BUCKET")
AWS_REGION = os.getenv("AWS_REGION")

#  Get presigned upload URL
@router.post("/presigned-url", response_model=PresignedUrlResponse)
async def get_presigned_url(data: PresignedUrlRequest, current_user: User = Depends(get_current_user)):
    #  Validate file type

    allowed_types=[
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
        "application/pdf",
        "text/plain",
        "application/zip"
    ]

    if data.content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type. Allowed types {', '.join(allowed_types)}"
        )
    
    #  Generate unique key
    file_extension = data.file_name.split(".")[-1] if "." in data.file_name else ""
    unique_id = f"{uuid.uuid4()}.{file_extension}" if file_extension else str(uuid.uuid4())
    file_key = f"uploads/{current_user.id}/{unique_id}"

    try:
        #  Generate presigned URL - valid for 5 minutes
        upload_url = s3_client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": S3_BUCKET,
                "Key": file_key,
                "ContentType": data.content_type
            },
            ExpiresIn=300
        )
        #  Public URL of the file after upload
        file_url = f"https://{S3_BUCKET}.s3.{AWS_REGION}.amazonaws.com/{file_key}"
        
        return PresignedUrlResponse(
            upload_url=upload_url,
            file_url=file_url,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate presigned URL: {str(e)}"
        )    
    
    
    

