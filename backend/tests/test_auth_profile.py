from src.auth.repositories.auth_repo import AuthRepo


class FakeTable:
    def __init__(self):
        self.upsert_payload = None
        self.upsert_options = None

    def upsert(self, payload, **options):
        self.upsert_payload = payload
        self.upsert_options = options
        return self

    def execute(self):
        return "executed"


class FakeClient:
    def __init__(self):
        self.table_name = None
        self.table_instance = FakeTable()

    def table(self, name):
        self.table_name = name
        return self.table_instance


def test_upsert_profile_writes_required_profile_fields():
    admin_client = FakeClient()
    repo = AuthRepo(admin=admin_client, user=FakeClient())

    result = repo.upsert_profile(
        user_id="187dba07-0ba8-46ae-9786-fac9cfab313c",
        email=" Learner@Example.com ",
        display_name="Learner",
        avatar_url="https://example.com/avatar.png",
    )

    assert result == "executed"
    assert admin_client.table_name == "profiles"
    assert admin_client.table_instance.upsert_payload == {
        "id": "187dba07-0ba8-46ae-9786-fac9cfab313c",
        "user_name": "learner@example.com",
        "email": "Learner@Example.com",
        "display_name": "Learner",
        "avatar_url": "https://example.com/avatar.png",
    }
    assert admin_client.table_instance.upsert_options == {
        "on_conflict": "id",
        "ignore_duplicates": False,
    }


def test_upsert_profile_rejects_blank_email():
    repo = AuthRepo(admin=FakeClient(), user=FakeClient())

    try:
        repo.upsert_profile(
            user_id="187dba07-0ba8-46ae-9786-fac9cfab313c",
            email=" ",
            display_name="Learner",
        )
    except ValueError as error:
        assert str(error) == "A valid email is required to create a user profile."
    else:
        raise AssertionError("A blank email must not be written to profiles.")
