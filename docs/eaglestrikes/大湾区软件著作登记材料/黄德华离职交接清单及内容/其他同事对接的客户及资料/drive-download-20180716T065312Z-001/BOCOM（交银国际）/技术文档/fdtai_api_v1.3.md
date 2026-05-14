# FDTAI API Doc

- [URL](#url)
- [Log In](#log-in)
- [Log Out](#log-out)

## URL

- **UAT env**

  https://aiuat.bocomgroup.com/pa?account_no={account_no}&lang=zh_cn&token={token}

- **Production env**

  https://ai.bocomgroup.com/pa?account_no={account_no}&lang=zh_cn&token={token}

## Log In

_To generate JWT for logged in user to access FDTAI page._

- **URL**

  /api/v1/login

- **Method:**

  `POST`

- **Data Params**

  ```json
  {
    "username": "myusername",  // account_no
    "goldenkey": "mygoldenkey" // configable
  }
  ```

- **Success Response:**
  - **Code:** `200`

    ```json
    {
      "data": "my.jwt.token"
    }
    ```

- **Error Response:**

  - **Code:** `401`
      ```json
      {
        "data": "credential is bad"
      }
      ```

## Log Out

_To invalidate JWT for logged in user, so that the user can not access FDTAI page using that token._

- **URL**

  /api/v1/logout

- **Method:**

  `POST`

- **Header:**

  `"Authorization": "Bearer my.jwt.token"`

- **Data Params**

  ```json
  {
    "username": "myusername"
  }
  ```

- **Success Response:**

  - **Code:** `200`
    ```json
    {
      "data": "logged out"
    }
    ```

- **Error Response:**

  - **Code:** `403`
    ```json
    {
      "data": "unauthorized username"
    }
    ```
  - **Code:** `401`
    ```json
    {
      "data": "signature is illegal"
    }
    ```